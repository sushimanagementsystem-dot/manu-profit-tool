/**
 * Deterministic profitability math. Nothing in this file calls an LLM or
 * guesses a value — every function either returns a number or explains
 * why it couldn't (missing cost data, zero price, etc.) via `confidence`.
 * n8n's workflow re-implements the same formulas in a Code node, since it
 * runs in a separate process; see n8n/menu-profit-workflow.json. Keep both
 * in sync by hand for Phase 1 — see changes.md for why this isn't shared code.
 */

export type DataConfidence = "verified" | "estimated" | "incomplete";

export type CalculationResult = {
  value: number | null;
  confidence: DataConfidence;
  /** Present when confidence is "incomplete" or "estimated", explains why. */
  note?: string;
};

function ok(value: number): CalculationResult {
  return { value, confidence: "verified" };
}

function incomplete(note: string): CalculationResult {
  return { value: null, confidence: "incomplete", note };
}

/**
 * Sum of (ingredient unit cost × quantity used per portion).
 * Any ingredient missing a unit cost makes the whole result "incomplete"
 * rather than silently treating it as free.
 */
export function costPerPortion(
  ingredients: { quantityPerPortion: number; unitCost: number | null }[],
): CalculationResult {
  if (ingredients.length === 0) {
    return incomplete("No ingredients linked to this menu item.");
  }

  const missing = ingredients.filter((i) => i.unitCost === null);
  if (missing.length > 0) {
    return incomplete(
      `${missing.length} of ${ingredients.length} ingredient(s) have no matched supplier cost.`,
    );
  }

  const total = ingredients.reduce(
    (sum, i) => sum + i.quantityPerPortion * (i.unitCost as number),
    0,
  );
  return ok(total);
}

/** Gross profit per portion = net selling price − direct ingredient cost. */
export function grossProfitPerPortion(
  netSellingPrice: number | null,
  ingredientCost: CalculationResult,
): CalculationResult {
  if (netSellingPrice === null) {
    return incomplete("No selling price found for this item.");
  }
  if (ingredientCost.value === null) {
    return incomplete(ingredientCost.note ?? "Ingredient cost unavailable.");
  }
  return ok(netSellingPrice - ingredientCost.value);
}

/** GP% = gross profit / net selling price × 100. */
export function gpPercent(
  netSellingPrice: number | null,
  grossProfit: CalculationResult,
): CalculationResult {
  if (netSellingPrice === null) {
    return incomplete("No selling price found for this item.");
  }
  if (netSellingPrice === 0) {
    return incomplete("Selling price is zero — GP% is undefined.");
  }
  if (grossProfit.value === null) {
    return incomplete(grossProfit.note ?? "Gross profit unavailable.");
  }
  return ok((grossProfit.value / netSellingPrice) * 100);
}

/** Total GP contribution = GP per portion × units sold. */
export function totalGpContribution(
  grossProfit: CalculationResult,
  unitsSold: number | null,
): CalculationResult {
  if (unitsSold === null) {
    return incomplete("No units-sold figure found in the POS report.");
  }
  if (grossProfit.value === null) {
    return incomplete(grossProfit.note ?? "Gross profit unavailable.");
  }
  return ok(grossProfit.value * unitsSold);
}

/** Sales mix = item units / total units × 100. */
export function salesMixPercent(
  itemUnits: number | null,
  totalUnits: number,
): CalculationResult {
  if (itemUnits === null) {
    return incomplete("No units-sold figure found for this item.");
  }
  if (totalUnits === 0) {
    return incomplete("Total units sold across the menu is zero.");
  }
  return ok((itemUnits / totalUnits) * 100);
}
