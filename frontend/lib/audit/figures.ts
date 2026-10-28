import type { ResultItem, ResultsResponse } from "@/lib/api/types";

/**
 * Sales the POS reported that are not attached to any menu item: the headline totals include
 * them, the table (menu items only) cannot. Worked out as the difference, so it needs no extra
 * field from the server. Null when the figures are not known, "0" amounts are not worth a line.
 */
export function unlinkedSales(
  summary: ResultsResponse["summary"],
  items: ResultItem[],
): { revenue: number; units: number } {
  const revenue = Number(summary.netRevenue ?? 0) - items.reduce((sum, i) => sum + Number(i.netRevenue.value ?? 0), 0);
  const units = Number(summary.unitsSold ?? 0) - items.reduce((sum, i) => sum + Number(i.unitsSold ?? 0), 0);
  return { revenue: revenue > 0.005 ? revenue : 0, units: units > 0.5 ? Math.round(units) : 0 };
}

const PRICE_BASIS: Record<NonNullable<ResultsResponse["assumptions"]>["priceBasis"], string> = {
  LATEST: "latest invoice",
  WEIGHTED_AVG: "weighted average",
  MAX: "highest paid",
};

const percent = (fraction: string) => {
  const value = Number(fraction) * 100;
  return `${Number.isInteger(value) ? value : value.toFixed(1).replace(/\.0$/, "")}%`;
};

/** The assumptions as short label/value pairs for the "Calculated with" row. */
export function assumptionChips(
  assumptions: NonNullable<ResultsResponse["assumptions"]>,
): { label: string; value: string }[] {
  const vat = !assumptions.vatRate
    ? "not set"
    : assumptions.vatRateDrink
      ? `${percent(assumptions.vatRate)} food · ${percent(assumptions.vatRateDrink)} drinks`
      : percent(assumptions.vatRate);
  return [
    { label: "VAT", value: vat },
    { label: "Menu prices", value: assumptions.menuPricesIncludeVat ? "include VAT" : "exclude VAT" },
    { label: "Ingredient price", value: PRICE_BASIS[assumptions.priceBasis] },
    { label: "Wastage", value: percent(assumptions.wastagePct) },
  ];
}

/** Issues counted the way the attention box words them. */
export function issueCounts(issues: ResultsResponse["issues"]) {
  return {
    total: issues.length,
    critical: issues.filter((i) => i.severity === "critical").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    notes: issues.filter((i) => i.severity === "info").length,
  };
}
