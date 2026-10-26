import { Decimal, sum, ZERO } from '../../common/decimal';
import { findIssues } from './data-quality';
import { ingredientUnitCost } from './ingredient-costs';
import { computeItem } from './item-metrics';
import { applyMenuEngineering, applyMixes, categoryRollups } from './menu-engineering';
import { buildRecommendations } from './recommendations';
import type { EngineInput, EngineResult, IngredientResult, ItemResult, Metric, Summary } from './types';

export * from './types';

/** Bump when a formula changes, so stored snapshots record which rules produced them. */
export const CALC_VERSION = '1.0.0';

const HUNDRED = new Decimal(100);

/**
 * The deterministic calculation engine: pure, no I/O, no AI. Every financial figure shown to
 * the client or written to an export comes from here. Formulas: docs/ARCHITECTURE.md §10.
 */
export function computeResults(input: EngineInput, currency: string): EngineResult {
  const unitCosts = new Map<string, Metric>();
  const ingredientNames = new Map<string, string>();
  for (const ingredient of input.ingredients) {
    unitCosts.set(ingredient.id, ingredientUnitCost(ingredient, input.assumptions.priceBasis));
    ingredientNames.set(ingredient.id, ingredient.name);
  }

  const items = input.menuItems.map((item) =>
    computeItem(
      item,
      input.sales.filter((sale) => sale.menuItemId === item.id),
      input.recipeLines.filter((line) => line.menuItemId === item.id),
      unitCosts,
      ingredientNames,
      input.assumptions,
    ),
  );
  applyMixes(items);
  const matrix = applyMenuEngineering(items);

  const ingredients: IngredientResult[] = input.ingredients.map((ingredient) => ({
    ingredientId: ingredient.id,
    name: ingredient.name,
    baseUnit: ingredient.baseUnit,
    unitCost: unitCosts.get(ingredient.id) as Metric,
    usedInItems: new Set(
      input.recipeLines.filter((line) => line.ingredientId === ingredient.id).map((line) => line.menuItemId),
    ).size,
  }));

  const summary = summarize(input, items);
  return {
    summary,
    items,
    categories: categoryRollups(items),
    ingredients,
    matrix,
    issues: findIssues(input, items, ingredients),
    recommendations: buildRecommendations(items, summary, currency),
  };
}

function summarize(input: EngineInput, items: ItemResult[]): Summary {
  const itemRevenue = sum(items.map((item) => item.netRevenue.value ?? ZERO));
  const unmatchedRevenue = sum(input.unmatchedSales.map((sale) => sale.netRevenue ?? sale.grossRevenue ?? ZERO));
  const netRevenue = itemRevenue.plus(unmatchedRevenue);

  const costed = items.filter((item) => item.realisedGp.value && item.netRevenue.value);
  const costedRevenue = sum(costed.map((item) => item.netRevenue.value as Decimal));
  const realisedGp = costed.length ? sum(costed.map((item) => item.realisedGp.value as Decimal)) : null;
  const theoretical = items.filter((item) => item.theoreticalGp.value);

  return {
    netRevenue,
    unitsSold: sum(items.map((item) => item.unitsSold)).plus(sum(input.unmatchedSales.map((sale) => sale.quantity))),
    theoreticalGp: theoretical.length ? sum(theoretical.map((item) => item.theoreticalGp.value as Decimal)) : null,
    realisedGp,
    gpPercent: realisedGp && !costedRevenue.isZero() ? realisedGp.dividedBy(costedRevenue).times(HUNDRED) : null,
    itemsTotal: items.length,
    itemsCosted: items.filter((item) => item.costPerPortion.value).length,
    revenueCoveredPercent: netRevenue.isZero() ? null : costedRevenue.dividedBy(netRevenue).times(HUNDRED),
  };
}
