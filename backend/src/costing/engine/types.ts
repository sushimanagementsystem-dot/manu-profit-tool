import type { Decimal } from '../../common/decimal';
import type { BaseUnit } from '../../generated/prisma/enums';

/** Ordered from most to least trustworthy; see docs/ARCHITECTURE.md §10. */
export type ConfidenceLevel = 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'ESTIMATED' | 'INCOMPLETE';

/** A calculated value plus how much it can be trusted and why. `value` is null only when INCOMPLETE. */
export type Metric = { value: Decimal | null; confidence: ConfidenceLevel; reasons: string[] };

export type PriceBasis = 'LATEST' | 'WEIGHTED_AVG' | 'MAX';

export type EngineAssumptions = {
  /** VAT as a fraction (0.135 = 13.5 %); null when the client hasn't said. */
  vatRate: Decimal | null;
  vatRateDrink: Decimal | null;
  menuPricesIncludeVat: boolean;
  priceBasis: PriceBasis;
  /** Fraction added to every recipe quantity for trim/waste. */
  wastagePct: Decimal;
};

export type EngineMenuItem = {
  id: string;
  name: string;
  category: string | null;
  grossPrice: Decimal | null;
  priceConfidence: ConfidenceLevel;
};

export type EngineSale = {
  menuItemId: string;
  quantity: Decimal;
  netRevenue: Decimal | null;
  grossRevenue: Decimal | null;
  matchConfidence: ConfidenceLevel;
};

export type EngineUnmatchedSale = {
  name: string;
  quantity: Decimal;
  netRevenue: Decimal | null;
  grossRevenue: Decimal | null;
};

export type EnginePrice = {
  pricePerBaseUnit: Decimal;
  source: 'INVOICE' | 'USER';
  date: Date | null;
  /** Purchased base quantity, used to weight averages. */
  baseQuantity: Decimal | null;
  confidence: ConfidenceLevel;
  createdAt: Date;
};

export type EngineIngredient = {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  prices: EnginePrice[];
};

export type EngineRecipeLine = {
  id: string;
  menuItemId: string;
  ingredientId: string;
  baseQuantity: Decimal;
  source: 'USER' | 'AI_ESTIMATE';
};

export type EngineInput = {
  assumptions: EngineAssumptions;
  menuItems: EngineMenuItem[];
  sales: EngineSale[];
  unmatchedSales: EngineUnmatchedSale[];
  ingredients: EngineIngredient[];
  recipeLines: EngineRecipeLine[];
};

export type MatrixClass = 'STAR' | 'PLOWHORSE' | 'PUZZLE' | 'DOG';

export type ItemResult = {
  menuItemId: string;
  name: string;
  category: string | null;
  grossPrice: Decimal | null;
  vatRate: Decimal | null;
  netPrice: Metric;
  costPerPortion: Metric;
  gpPerPortion: Metric;
  gpPercent: Metric;
  foodCostPercent: Metric;
  unitsSold: Decimal;
  netRevenue: Metric;
  salesMixPercent: Decimal | null;
  revenueMixPercent: Decimal | null;
  theoreticalGp: Metric;
  realisedGp: Metric;
  matrixClass: MatrixClass | null;
  confidence: ConfidenceLevel;
  reasons: string[];
};

export type IngredientResult = {
  ingredientId: string;
  name: string;
  baseUnit: BaseUnit;
  unitCost: Metric;
  usedInItems: number;
};

export type CategoryResult = {
  category: string;
  items: number;
  unitsSold: Decimal;
  netRevenue: Decimal;
  theoreticalGp: Decimal | null;
  gpPercent: Decimal | null;
};

export type Summary = {
  netRevenue: Decimal;
  unitsSold: Decimal;
  theoreticalGp: Decimal | null;
  realisedGp: Decimal | null;
  gpPercent: Decimal | null;
  itemsTotal: number;
  itemsCosted: number;
  revenueCoveredPercent: Decimal | null;
};

export type IssueSeverity = 'info' | 'warning' | 'critical';

export type Issue = {
  code: string;
  severity: IssueSeverity;
  text: string;
  menuItemId?: string;
  ingredientId?: string;
};

export type RecommendationKind = 'PRICE' | 'COST' | 'MENU_MIX' | 'DATA_QUALITY';

export type Recommendation = {
  kind: RecommendationKind;
  priority: number;
  title: string;
  body: string;
  menuItemId: string | null;
  /** Net gross-profit change for the analysed period, computed by the engine (constant volume). */
  impactGp: Decimal | null;
};

export type EngineResult = {
  summary: Summary;
  items: ItemResult[];
  categories: CategoryResult[];
  ingredients: IngredientResult[];
  matrix: { categoryThresholds: { category: string; popularityPercent: Decimal; averageGp: Decimal | null }[] };
  issues: Issue[];
  recommendations: Recommendation[];
};
