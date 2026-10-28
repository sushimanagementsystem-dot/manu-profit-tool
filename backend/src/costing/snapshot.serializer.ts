import { toStr, type Decimal } from '../common/decimal';
import type { EngineResult, Issue, Metric } from './engine';

/** JSON form of a Metric: decimals as strings so no precision is lost on the wire. */
export type MetricJson = { value: string | null; confidence: Metric['confidence']; reasons: string[] };

const metric = (value: Metric): MetricJson => ({
  value: toStr(value.value),
  confidence: value.confidence,
  reasons: value.reasons,
});

const str = (value: Decimal | null) => toStr(value);

export type RecipeLineJson = {
  recipeLineId: string;
  ingredientId: string;
  ingredientName: string;
  quantity: string;
  unit: string;
  baseQuantity: string;
  baseUnit: string;
  source: 'USER' | 'AI_ESTIMATE';
};

export type SupplierPriceJson = {
  supplier: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  description: string;
  quantity: string | null;
  pack: string | null;
  lineNet: string | null;
  costPerBaseUnit: string | null;
  baseUnit: string | null;
  confidence: string;
};

export type PendingMatchJson = {
  matchId: string;
  posName: string;
  suggestedMenuItemId: string | null;
  suggestedMenuItemName: string | null;
  score: string;
};

export type SnapshotPayload = ReturnType<typeof serializeResult>;

/** The stored and served shape of a ResultSnapshot (see docs/API_SPECIFICATION.md → results). */
export function serializeResult(
  result: EngineResult,
  context: {
    revision: number;
    calcVersion: string;
    currency: string;
    extraIssues: Issue[];
    pendingMatches: PendingMatchJson[];
    /** Recipe detail per menu item, so exports are reproducible from the snapshot alone. */
    recipes: Map<string, RecipeLineJson[]>;
    supplierPrices: SupplierPriceJson[];
  },
) {
  return {
    revision: context.revision,
    calcVersion: context.calcVersion,
    currency: context.currency,
    summary: {
      netRevenue: str(result.summary.netRevenue),
      unitsSold: str(result.summary.unitsSold),
      theoreticalGp: str(result.summary.theoreticalGp),
      realisedGp: str(result.summary.realisedGp),
      gpPercent: str(result.summary.gpPercent),
      itemsTotal: result.summary.itemsTotal,
      itemsCosted: result.summary.itemsCosted,
      revenueCoveredPercent: str(result.summary.revenueCoveredPercent),
    },
    items: result.items.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      category: item.category,
      grossPrice: str(item.grossPrice),
      vatRate: str(item.vatRate),
      netPrice: metric(item.netPrice),
      costPerPortion: metric(item.costPerPortion),
      costSource: item.costSource,
      gpPerPortion: metric(item.gpPerPortion),
      gpPercent: metric(item.gpPercent),
      foodCostPercent: metric(item.foodCostPercent),
      unitsSold: str(item.unitsSold),
      netRevenue: metric(item.netRevenue),
      salesMixPercent: str(item.salesMixPercent),
      revenueMixPercent: str(item.revenueMixPercent),
      theoreticalGp: metric(item.theoreticalGp),
      realisedGp: metric(item.realisedGp),
      matrixClass: item.matrixClass,
      confidence: item.confidence,
      reasons: item.reasons,
      recipe: context.recipes.get(item.menuItemId) ?? [],
    })),
    categories: result.categories.map((category) => ({
      category: category.category,
      items: category.items,
      unitsSold: str(category.unitsSold),
      netRevenue: str(category.netRevenue),
      theoreticalGp: str(category.theoreticalGp),
      gpPercent: str(category.gpPercent),
    })),
    ingredients: result.ingredients.map((ingredient) => ({
      ingredientId: ingredient.ingredientId,
      name: ingredient.name,
      baseUnit: ingredient.baseUnit,
      unitCost: { ...metric(ingredient.unitCost), value: toStr(ingredient.unitCost.value, 8) },
      usedInItems: ingredient.usedInItems,
    })),
    matrix: {
      categoryThresholds: result.matrix.categoryThresholds.map((threshold) => ({
        category: threshold.category,
        popularityPercent: str(threshold.popularityPercent),
        averageGp: str(threshold.averageGp),
      })),
    },
    supplierPrices: context.supplierPrices,
    issues: [...context.extraIssues, ...result.issues],
    pendingMatches: context.pendingMatches,
    recommendations: result.recommendations.map((recommendation) => ({
      ...recommendation,
      impactGp: str(recommendation.impactGp),
    })),
  };
}
