import { Decimal } from '../../common/decimal';
import { computeResults } from './index';
import type { EngineAssumptions, EngineInput } from './types';

const dec = (value: string) => new Decimal(value);

const assumptions = (overrides: Partial<EngineAssumptions> = {}): EngineAssumptions => ({
  vatRate: dec('0.135'),
  vatRateDrink: dec('0.23'),
  menuPricesIncludeVat: true,
  priceBasis: 'LATEST',
  wastagePct: dec('0'),
  ...overrides,
});

/**
 * One burger priced at 14.50 incl. 13.5% VAT, 320 sold, made of 180 g beef at 0.003/g
 * and one bun at 0.30 — hand-computed: net 12.775330..., cost 0.84, GP 11.935330...
 */
function burgerInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    assumptions: assumptions(),
    menuItems: [
      { id: 'burger', name: 'Classic Burger', category: 'Mains', grossPrice: dec('14.50'), priceConfidence: 'VERIFIED', costOverride: null },
    ],
    sales: [
      { menuItemId: 'burger', quantity: dec('320'), netRevenue: dec('3680'), grossRevenue: null, matchConfidence: 'VERIFIED' },
    ],
    unmatchedSales: [],
    ingredients: [
      {
        id: 'beef',
        name: 'Beef Mince',
        baseUnit: 'G',
        prices: [
          { pricePerBaseUnit: dec('0.003'), source: 'INVOICE', date: new Date('2026-09-05'), baseQuantity: dec('30000'), confidence: 'VERIFIED', createdAt: new Date('2026-09-05') },
        ],
      },
      {
        id: 'bun',
        name: 'Burger Bun',
        baseUnit: 'EACH',
        prices: [
          { pricePerBaseUnit: dec('0.30'), source: 'INVOICE', date: new Date('2026-09-05'), baseQuantity: dec('120'), confidence: 'VERIFIED', createdAt: new Date('2026-09-05') },
        ],
      },
    ],
    recipeLines: [
      { id: 'r1', menuItemId: 'burger', ingredientId: 'beef', baseQuantity: dec('180'), source: 'USER' },
      { id: 'r2', menuItemId: 'burger', ingredientId: 'bun', baseQuantity: dec('1'), source: 'USER' },
    ],
    ...overrides,
  };
}

const firstItem = (input: EngineInput) => computeResults(input, 'EUR').items[0];

describe('per-item financials', () => {
  it('computes net price, cost, gross profit and GP% from the documents', () => {
    const item = firstItem(burgerInput());
    expect(item.netPrice.value?.toFixed(4)).toBe('12.7753');
    expect(item.costPerPortion.value?.toFixed(4)).toBe('0.8400');
    expect(item.gpPerPortion.value?.toFixed(4)).toBe('11.9353');
    expect(item.gpPercent.value?.toFixed(2)).toBe('93.42');
    expect(item.foodCostPercent.value?.toFixed(2)).toBe('6.58');
    // A recipe the client entered is not document-verified, so the item is only partly verified.
    expect(item.confidence).toBe('PARTIALLY_VERIFIED');
  });

  it('multiplies gross profit by units for the contribution', () => {
    const item = firstItem(burgerInput());
    // 320 × (14.50/1.135 − 0.84); nothing is rounded before the multiplication.
    expect(item.theoreticalGp.value?.toFixed(2)).toBe('3819.31');
    // Realised: POS revenue 3680 − 320 portions × 0.84 = 3411.20
    expect(item.realisedGp.value?.toFixed(2)).toBe('3411.20');
  });

  it('uses the drinks VAT rate for drink categories', () => {
    const input = burgerInput();
    input.menuItems[0] = { ...input.menuItems[0], category: 'Drinks', grossPrice: dec('6.00') };
    expect(firstItem(input).netPrice.value?.toFixed(4)).toBe('4.8780');
  });

  it('treats prices as net when the client says they exclude VAT', () => {
    const input = burgerInput();
    input.assumptions = assumptions({ menuPricesIncludeVat: false });
    expect(firstItem(input).netPrice.value?.toFixed(2)).toBe('14.50');
  });

  it('adds the wastage allowance to every recipe quantity', () => {
    const input = burgerInput();
    input.assumptions = assumptions({ wastagePct: dec('0.10') });
    expect(firstItem(input).costPerPortion.value?.toFixed(4)).toBe('0.9240');
  });
});

describe('missing data is reported, never guessed', () => {
  it('leaves cost unknown when an item has no recipe', () => {
    const input = burgerInput({ recipeLines: [] });
    const item = firstItem(input);
    expect(item.costPerPortion.value).toBeNull();
    expect(item.costPerPortion.confidence).toBe('INCOMPLETE');
    expect(item.gpPerPortion.value).toBeNull();
    expect(item.reasons.join(' ')).toContain('no recipe');
  });

  it('leaves cost unknown when one ingredient has no price', () => {
    const input = burgerInput();
    input.ingredients[1] = { ...input.ingredients[1], prices: [] };
    const item = firstItem(input);
    expect(item.costPerPortion.value).toBeNull();
    expect(item.reasons.join(' ')).toContain('Burger Bun has no price');
  });

  it('leaves everything priced unknown when the item has no selling price', () => {
    const input = burgerInput();
    input.menuItems[0] = { ...input.menuItems[0], grossPrice: null };
    const item = firstItem(input);
    expect(item.netPrice.value).toBeNull();
    expect(item.gpPercent.value).toBeNull();
    expect(item.costPerPortion.value?.toFixed(2)).toBe('0.84');
  });

  it('does not divide by a zero selling price', () => {
    const input = burgerInput();
    input.menuItems[0] = { ...input.menuItems[0], grossPrice: dec('0') };
    expect(firstItem(input).gpPercent.value).toBeNull();
  });

  it('marks an AI-estimated recipe as estimated and says so', () => {
    const input = burgerInput();
    input.recipeLines = input.recipeLines.map((line) => ({ ...line, source: 'AI_ESTIMATE' as const }));
    const item = firstItem(input);
    expect(item.costPerPortion.confidence).toBe('ESTIMATED');
    expect(item.confidence).toBe('ESTIMATED');
    expect(item.reasons.join(' ')).toContain('AI estimate');
  });

  it('marks revenue estimated when the POS report has no revenue column', () => {
    const input = burgerInput();
    input.sales = [{ menuItemId: 'burger', quantity: dec('320'), netRevenue: null, grossRevenue: null, matchConfidence: 'VERIFIED' }];
    const item = firstItem(input);
    expect(item.netRevenue.confidence).toBe('ESTIMATED');
    expect(item.netRevenue.value?.toFixed(2)).toBe('4088.11');
  });

  it('converts gross POS revenue to net using the VAT rate', () => {
    const input = burgerInput();
    input.sales = [{ menuItemId: 'burger', quantity: dec('320'), netRevenue: null, grossRevenue: dec('4640'), matchConfidence: 'VERIFIED' }];
    expect(firstItem(input).netRevenue.value?.toFixed(2)).toBe('4088.11');
  });
});

describe('ingredient price basis', () => {
  const twoPrices = () => {
    const input = burgerInput();
    input.ingredients[0] = {
      ...input.ingredients[0],
      prices: [
        { pricePerBaseUnit: dec('0.002'), source: 'INVOICE', date: new Date('2026-09-01'), baseQuantity: dec('30000'), confidence: 'VERIFIED', createdAt: new Date('2026-09-01') },
        { pricePerBaseUnit: dec('0.004'), source: 'INVOICE', date: new Date('2026-09-20'), baseQuantity: dec('10000'), confidence: 'VERIFIED', createdAt: new Date('2026-09-20') },
      ],
    };
    return input;
  };

  it('uses the latest invoice price by default', () => {
    // 180 g × 0.004 + bun 0.30
    expect(firstItem(twoPrices()).costPerPortion.value?.toFixed(4)).toBe('1.0200');
  });

  it('can weight prices by purchased quantity', () => {
    const input = twoPrices();
    input.assumptions = assumptions({ priceBasis: 'WEIGHTED_AVG' });
    // (0.002×30000 + 0.004×10000) / 40000 = 0.0025
    expect(firstItem(input).costPerPortion.value?.toFixed(4)).toBe('0.7500');
  });

  it('can use the highest price seen', () => {
    const input = twoPrices();
    input.assumptions = assumptions({ priceBasis: 'MAX' });
    expect(firstItem(input).costPerPortion.value?.toFixed(4)).toBe('1.0200');
  });

  it('prefers a price the client entered over invoice evidence', () => {
    const input = twoPrices();
    input.ingredients[0].prices.push({
      pricePerBaseUnit: dec('0.005'),
      source: 'USER',
      date: null,
      baseQuantity: null,
      confidence: 'PARTIALLY_VERIFIED',
      createdAt: new Date('2026-09-25'),
    });
    const item = firstItem(input);
    expect(item.costPerPortion.value?.toFixed(4)).toBe('1.2000');
    expect(item.costPerPortion.confidence).toBe('PARTIALLY_VERIFIED');
  });
});

describe('menu mix and the engineering matrix', () => {
  const twoItemInput = (): EngineInput => ({
    ...burgerInput(),
    menuItems: [
      { id: 'star', name: 'Star Dish', category: 'Mains', grossPrice: dec('20'), priceConfidence: 'VERIFIED', costOverride: null },
      { id: 'dog', name: 'Dog Dish', category: 'Mains', grossPrice: dec('10'), priceConfidence: 'VERIFIED', costOverride: null },
    ],
    sales: [
      { menuItemId: 'star', quantity: dec('300'), netRevenue: dec('5000'), grossRevenue: null, matchConfidence: 'VERIFIED' },
      { menuItemId: 'dog', quantity: dec('20'), netRevenue: dec('170'), grossRevenue: null, matchConfidence: 'VERIFIED' },
    ],
    recipeLines: [
      { id: 'r1', menuItemId: 'star', ingredientId: 'beef', baseQuantity: dec('100'), source: 'USER' },
      { id: 'r2', menuItemId: 'dog', ingredientId: 'beef', baseQuantity: dec('500'), source: 'USER' },
    ],
  });

  it('computes sales and revenue mix across the menu', () => {
    const result = computeResults(twoItemInput(), 'EUR');
    const star = result.items.find((item) => item.menuItemId === 'star');
    expect(star?.salesMixPercent?.toFixed(2)).toBe('93.75');
    expect(star?.revenueMixPercent?.toFixed(2)).toBe('96.71');
  });

  it('classifies a popular profitable dish as a star and the opposite as a dog', () => {
    const result = computeResults(twoItemInput(), 'EUR');
    expect(result.items.find((item) => item.menuItemId === 'star')?.matrixClass).toBe('STAR');
    expect(result.items.find((item) => item.menuItemId === 'dog')?.matrixClass).toBe('DOG');
  });

  it('rolls categories up from their items', () => {
    const [category] = computeResults(twoItemInput(), 'EUR').categories;
    expect(category.category).toBe('Mains');
    expect(category.items).toBe(2);
    expect(category.unitsSold.toString()).toBe('320');
  });
});

describe('summary and coverage', () => {
  it('counts unmatched POS revenue in the total but not in costed coverage', () => {
    const input = burgerInput({
      unmatchedSales: [{ name: 'Mystery Item', quantity: dec('50'), netRevenue: dec('500'), grossRevenue: null }],
    });
    const { summary, issues } = computeResults(input, 'EUR');
    expect(summary.netRevenue.toFixed(2)).toBe('4180.00');
    expect(summary.unitsSold.toFixed(0)).toBe('370');
    expect(summary.revenueCoveredPercent?.toFixed(2)).toBe('88.04');
    expect(issues.some((issue) => issue.code === 'pos_item_unmatched')).toBe(true);
  });

  it('reports a missing VAT rate as critical, because every net price depends on it', () => {
    const input = burgerInput();
    input.assumptions = assumptions({ vatRate: null, vatRateDrink: null });
    const { issues, items } = computeResults(input, 'EUR');
    expect(issues.find((issue) => issue.code === 'vat_rate_missing')?.severity).toBe('critical');
    expect(items[0].netPrice.confidence).toBe('ESTIMATED');
  });

  it('flags a POS price that differs from the menu price', () => {
    const input = burgerInput();
    input.sales = [{ menuItemId: 'burger', quantity: dec('100'), netRevenue: null, grossRevenue: dec('1200'), matchConfidence: 'VERIFIED' }];
    const { issues } = computeResults(input, 'EUR');
    expect(issues.some((issue) => issue.code === 'price_changed_in_period')).toBe(true);
  });
});

describe('recommendations', () => {
  it('quantifies a price rise on a popular low-margin dish', () => {
    const input: EngineInput = {
      ...burgerInput(),
      menuItems: [
        { id: 'plow', name: 'Plowhorse', category: 'Mains', grossPrice: dec('10'), priceConfidence: 'VERIFIED', costOverride: null },
        { id: 'rich', name: 'Rich Dish', category: 'Mains', grossPrice: dec('30'), priceConfidence: 'VERIFIED', costOverride: null },
      ],
      sales: [
        { menuItemId: 'plow', quantity: dec('400'), netRevenue: dec('3500'), grossRevenue: null, matchConfidence: 'VERIFIED' },
        { menuItemId: 'rich', quantity: dec('380'), netRevenue: dec('10000'), grossRevenue: null, matchConfidence: 'VERIFIED' },
      ],
      recipeLines: [
        { id: 'r1', menuItemId: 'plow', ingredientId: 'beef', baseQuantity: dec('600'), source: 'USER' },
        { id: 'r2', menuItemId: 'rich', ingredientId: 'beef', baseQuantity: dec('100'), source: 'USER' },
      ],
    };
    const price = computeResults(input, 'EUR').recommendations.find((item) => item.kind === 'PRICE');
    // +0.50 gross on 400 units at 13.5% VAT = 400 × 0.50/1.135
    expect(price?.impactGp?.toFixed(2)).toBe('176.21');
    expect(price?.title).toContain('Plowhorse');
  });

  it('asks for recipes when costing covers too little revenue', () => {
    const input = burgerInput({ recipeLines: [] });
    const { recommendations } = computeResults(input, 'EUR');
    expect(recommendations.some((item) => item.kind === 'DATA_QUALITY')).toBe(true);
  });
});

describe('a cost entered by hand', () => {
  const withOverride = (cost: string, overrides: Partial<EngineInput> = {}) =>
    burgerInput({
      menuItems: [
        { id: 'burger', name: 'Classic Burger', category: 'Mains', grossPrice: dec('14.50'), priceConfidence: 'VERIFIED', costOverride: dec(cost) },
      ],
      ...overrides,
    });

  it('replaces the recipe cost and says where it came from', () => {
    const item = firstItem(withOverride('3.00'));
    expect(item.costPerPortion.value?.toNumber()).toBe(3);
    expect(item.costSource).toBe('MANUAL');
    expect(item.costPerPortion.confidence).toBe('PARTIALLY_VERIFIED');
    expect(item.costPerPortion.reasons).toContain('Cost of Classic Burger was entered by hand');
    // Everything downstream follows: GP = net price 12.7753… - 3.00
    expect(item.gpPerPortion.value?.toNumber()).toBeCloseTo(9.77533, 4);
  });

  it('is not marked up by the wastage allowance', () => {
    const item = firstItem(withOverride('3.00', { assumptions: assumptions({ wastagePct: dec('0.10') }) }));
    expect(item.costPerPortion.value?.toNumber()).toBe(3);
  });

  it('costs a dish that has no recipe, so it is not reported as missing one', () => {
    const result = computeResults(withOverride('3.00', { recipeLines: [] }), 'EUR');
    expect(result.items[0].costPerPortion.value?.toNumber()).toBe(3);
    expect(result.summary.itemsCosted).toBe(1);
    expect(result.issues.map((issue) => issue.code)).not.toContain('recipes_missing');
  });

  it('leaves the recipe in charge when nothing was entered', () => {
    const item = firstItem(burgerInput());
    expect(item.costSource).toBe('RECIPE');
    expect(item.costPerPortion.value?.toNumber()).toBeCloseTo(0.84, 6);
  });
});
