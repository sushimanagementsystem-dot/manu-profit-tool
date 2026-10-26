import { Decimal, sum, ZERO } from '../../common/decimal';
import type { EngineInput, IngredientResult, Issue, ItemResult } from './types';

const HUNDRED = new Decimal(100);
const UNMATCHED_CRITICAL_PERCENT = new Decimal(2);
const PRICE_DRIFT_PERCENT = new Decimal(5);

/** Data-quality findings that follow from the calculation inputs. */
export function findIssues(input: EngineInput, items: ItemResult[], ingredients: IngredientResult[]): Issue[] {
  const issues: Issue[] = [];
  const { assumptions } = input;

  if (assumptions.menuPricesIncludeVat && !assumptions.vatRate) {
    issues.push({
      code: 'vat_rate_missing',
      severity: 'critical',
      text: 'The VAT rate is not set, so prices are treated as excluding VAT. Tell the assistant your VAT rate(s) to correct this.',
    });
  }

  for (const item of items.filter((candidate) => !candidate.grossPrice)) {
    issues.push({ code: 'price_missing', severity: 'warning', text: `${item.name} has no selling price.`, menuItemId: item.menuItemId });
  }

  const noRecipe = items.filter((item) => item.costPerPortion.reasons.some((reason) => reason.endsWith('has no recipe yet')));
  if (noRecipe.length) {
    const sold = noRecipe.filter((item) => item.unitsSold.gt(0));
    issues.push({
      code: 'recipes_missing',
      severity: sold.length ? 'warning' : 'info',
      text: `${noRecipe.length} menu item(s) have no recipe, so their cost per portion is unknown${sold.length ? ` (best sellers: ${topNames(sold)})` : ''}.`,
    });
  }

  for (const ingredient of ingredients.filter((candidate) => !candidate.unitCost.value && candidate.usedInItems > 0)) {
    issues.push({
      code: 'ingredient_price_missing',
      severity: 'warning',
      text: `${ingredient.name} is used in ${ingredient.usedInItems} recipe(s) but has no price.`,
      ingredientId: ingredient.ingredientId,
    });
  }

  const estimatedRecipes = input.recipeLines.filter((line) => line.source === 'AI_ESTIMATE');
  if (estimatedRecipes.length) {
    issues.push({
      code: 'recipes_estimated',
      severity: 'info',
      text: `${new Set(estimatedRecipes.map((line) => line.menuItemId)).size} recipe(s) are AI estimates. Confirm or correct the quantities for accurate costs.`,
    });
  }

  issues.push(...unmatchedSalesIssues(input, items));
  issues.push(...priceDriftIssues(input, items));
  return issues;
}

function unmatchedSalesIssues(input: EngineInput, items: ItemResult[]): Issue[] {
  const matchedRevenue = sum(items.map((item) => item.netRevenue.value ?? ZERO));
  const unmatchedRevenue = sum(input.unmatchedSales.map((sale) => sale.netRevenue ?? sale.grossRevenue ?? ZERO));
  const total = matchedRevenue.plus(unmatchedRevenue);

  return input.unmatchedSales.map((sale) => {
    const revenue = sale.netRevenue ?? sale.grossRevenue ?? ZERO;
    const share = total.isZero() ? ZERO : revenue.dividedBy(total).times(HUNDRED);
    return {
      code: 'pos_item_unmatched',
      severity: share.gte(UNMATCHED_CRITICAL_PERCENT) ? 'critical' : 'info',
      text: `POS item "${sale.name}" (${sale.quantity.toFixed(0)} sold, ${share.toFixed(1)}% of revenue) is not linked to a menu item.`,
    } satisfies Issue;
  });
}

/** Realised POS price differing from the menu price suggests a price change during the period. */
function priceDriftIssues(input: EngineInput, items: ItemResult[]): Issue[] {
  const issues: Issue[] = [];
  for (const item of items) {
    const sales = input.sales.filter((sale) => sale.menuItemId === item.menuItemId && sale.grossRevenue);
    const units = sum(sales.map((sale) => sale.quantity));
    if (!item.grossPrice || units.isZero()) continue;
    const realised = sum(sales.map((sale) => sale.grossRevenue as Decimal)).dividedBy(units);
    const drift = realised.minus(item.grossPrice).abs().dividedBy(item.grossPrice).times(HUNDRED);
    if (drift.gt(PRICE_DRIFT_PERCENT)) {
      issues.push({
        code: 'price_changed_in_period',
        severity: 'info',
        text: `${item.name}: average POS price ${realised.toFixed(2)} differs from the menu price ${item.grossPrice.toFixed(2)} by ${drift.toFixed(1)}% (price change, discounts or a different portion).`,
        menuItemId: item.menuItemId,
      });
    }
  }
  return issues;
}

function topNames(items: ItemResult[]): string {
  return [...items]
    .sort((a, b) => b.unitsSold.comparedTo(a.unitsSold))
    .slice(0, 3)
    .map((item) => item.name)
    .join(', ');
}
