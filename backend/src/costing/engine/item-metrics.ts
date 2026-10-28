import { Decimal, sum, ZERO } from '../../common/decimal';
import { derive, incomplete, known, unique, worst } from './confidence';
import type {
  EngineAssumptions,
  EngineMenuItem,
  EngineRecipeLine,
  EngineSale,
  ItemResult,
  Metric,
} from './types';

const HUNDRED = new Decimal(100);
const DRINK_CATEGORY = /drink|beverage|bar|wine|beer|cocktail|spirit|soft|coffee|tea|juice/i;

/** VAT rate that applies to a menu item: the drinks rate for drink categories when one is set. */
export function vatRateFor(category: string | null, assumptions: EngineAssumptions): Decimal | null {
  if (category && DRINK_CATEGORY.test(category) && assumptions.vatRateDrink) {
    return assumptions.vatRateDrink;
  }
  return assumptions.vatRate;
}

/** Net selling price = gross / (1 + VAT) when menu prices include VAT. */
export function netSellingPrice(item: EngineMenuItem, assumptions: EngineAssumptions): Metric {
  if (!item.grossPrice) return incomplete(`${item.name} has no selling price`);
  const priceReasons = item.priceConfidence === 'VERIFIED' ? [] : [`Selling price of ${item.name} is not from the menu file`];
  if (!assumptions.menuPricesIncludeVat) return known(item.grossPrice, item.priceConfidence, priceReasons);

  const vat = vatRateFor(item.category, assumptions);
  if (!vat) {
    return known(item.grossPrice, worst(item.priceConfidence, 'ESTIMATED'), [
      ...priceReasons,
      'VAT rate not set, so prices are treated as excluding VAT',
    ]);
  }
  return known(item.grossPrice.dividedBy(vat.plus(1)), item.priceConfidence, priceReasons);
}

/** Cost per portion = Σ recipe base quantity × (1 + wastage) × ingredient unit cost. */
export function costPerPortion(
  item: EngineMenuItem,
  lines: EngineRecipeLine[],
  unitCosts: Map<string, Metric>,
  ingredientNames: Map<string, string>,
  assumptions: EngineAssumptions,
): Metric {
  // A cost the client typed in is the answer, not an input to a recipe: no wastage on top of it.
  if (item.costOverride) {
    return known(item.costOverride, 'PARTIALLY_VERIFIED', [`Cost of ${item.name} was entered by hand`]);
  }
  if (!lines.length) return incomplete(`${item.name} has no recipe yet`);

  const wastageFactor = assumptions.wastagePct.plus(1);
  const lineMetrics = lines.map((line) => {
    const unitCost = unitCosts.get(line.ingredientId) ?? incomplete(`${ingredientNames.get(line.ingredientId) ?? 'An ingredient'} has no price`);
    const recipeMetric: Metric =
      line.source === 'AI_ESTIMATE'
        ? known(line.baseQuantity, 'ESTIMATED', [`Recipe of ${item.name} is an AI estimate`])
        : known(line.baseQuantity, 'PARTIALLY_VERIFIED', []);
    return derive([recipeMetric, unitCost], ([quantity, cost]) =>
      quantity.times(wastageFactor).times(cost),
    );
  });
  return derive(lineMetrics, (costs) => sum(costs));
}

/** Units and net revenue for an item from its matched POS lines. */
export function salesFor(
  item: EngineMenuItem,
  sales: EngineSale[],
  netPrice: Metric,
  vat: Decimal | null,
): { units: Decimal; netRevenue: Metric } {
  const units = sum(sales.map((sale) => sale.quantity));
  if (!sales.length) return { units: ZERO, netRevenue: known(ZERO) };

  const matchConfidence = worst(...sales.map((sale) => sale.matchConfidence));
  const matchReasons = matchConfidence === 'VERIFIED' ? [] : [`POS sales of ${item.name} were matched by name similarity`];

  if (sales.every((sale) => sale.netRevenue)) {
    return { units, netRevenue: known(sum(sales.map((sale) => sale.netRevenue as Decimal)), matchConfidence, matchReasons) };
  }
  if (sales.every((sale) => sale.netRevenue || sale.grossRevenue)) {
    const revenue = sum(
      sales.map((sale) => sale.netRevenue ?? (sale.grossRevenue as Decimal).dividedBy((vat ?? ZERO).plus(1))),
    );
    const confidence = vat ? matchConfidence : worst(matchConfidence, 'ESTIMATED');
    const reasons = vat ? matchReasons : [...matchReasons, 'POS revenue includes VAT but no VAT rate is set'];
    return { units, netRevenue: known(revenue, confidence, reasons) };
  }
  const estimated = derive([netPrice], ([price]) => price.times(units));
  return {
    units,
    netRevenue: {
      ...estimated,
      confidence: estimated.value ? worst(estimated.confidence, matchConfidence, 'ESTIMATED') : 'INCOMPLETE',
      reasons: unique([...estimated.reasons, ...matchReasons, `Revenue of ${item.name} estimated from its menu price`]),
    },
  };
}

/** All per-item metrics except the menu-engineering class and mixes (they need every item). */
export function computeItem(
  item: EngineMenuItem,
  sales: EngineSale[],
  lines: EngineRecipeLine[],
  unitCosts: Map<string, Metric>,
  ingredientNames: Map<string, string>,
  assumptions: EngineAssumptions,
): ItemResult {
  const vat = vatRateFor(item.category, assumptions);
  const netPrice = netSellingPrice(item, assumptions);
  const cost = costPerPortion(item, lines, unitCosts, ingredientNames, assumptions);
  const gp = derive([netPrice, cost], ([price, portionCost]) => price.minus(portionCost));
  const gpPercent = derive([gp, netPrice], ([profit, price]) => (price.isZero() ? null : profit.dividedBy(price).times(HUNDRED)));
  const foodCostPercent = derive([cost, netPrice], ([portionCost, price]) => (price.isZero() ? null : portionCost.dividedBy(price).times(HUNDRED)));
  const { units, netRevenue } = salesFor(item, sales, netPrice, vat);
  const theoreticalGp = derive([gp], ([profit]) => profit.times(units));
  const realisedGp = derive([netRevenue, cost], ([revenue, portionCost]) => revenue.minus(portionCost.times(units)));

  const parts = [netPrice, cost, netRevenue];
  return {
    menuItemId: item.id,
    name: item.name,
    category: item.category,
    grossPrice: item.grossPrice,
    vatRate: vat,
    netPrice,
    costPerPortion: cost,
    costSource: item.costOverride ? 'MANUAL' : 'RECIPE',
    gpPerPortion: gp,
    gpPercent,
    foodCostPercent,
    unitsSold: units,
    netRevenue,
    salesMixPercent: null,
    revenueMixPercent: null,
    theoreticalGp,
    realisedGp,
    matrixClass: null,
    confidence: worst(...parts.map((part) => part.confidence)),
    reasons: unique(parts.flatMap((part) => part.reasons)),
  };
}
