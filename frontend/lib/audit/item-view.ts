import type { Metric, ResultItem } from "@/lib/api/types";

export type ItemFilter = "all" | "needs-cost" | "estimated" | "set-by-you";
export type ItemSort = "sold" | "revenue" | "gp-percent" | "name";

export const FILTER_LABELS: Record<ItemFilter, string> = {
  all: "All",
  "needs-cost": "Needs a cost",
  estimated: "Estimated",
  "set-by-you": "Cost set by you",
};

export const SORT_LABELS: Record<ItemSort, string> = {
  sold: "Units sold",
  revenue: "Revenue",
  "gp-percent": "GP %",
  name: "Name",
};

export const isEstimate = (metric: Metric) =>
  metric.confidence === "ESTIMATED" && metric.value !== null;

const needsCost = (item: ResultItem) => item.costPerPortion.value === null;

const hasEstimate = (item: ResultItem) =>
  [item.netPrice, item.costPerPortion, item.gpPerPortion, item.gpPercent, item.netRevenue].some(
    isEstimate,
  );

const MATCHES: Record<ItemFilter, (item: ResultItem) => boolean> = {
  all: () => true,
  "needs-cost": needsCost,
  estimated: hasEstimate,
  "set-by-you": (item) => item.costSource === "MANUAL",
};

/** How many items each filter would show, for the count on its chip. */
export function filterCounts(items: ResultItem[]): Record<ItemFilter, number> {
  const counts = {} as Record<ItemFilter, number>;
  for (const filter of Object.keys(MATCHES) as ItemFilter[]) {
    counts[filter] = items.filter(MATCHES[filter]).length;
  }
  return counts;
}

const number = (value: string | null) => (value === null ? null : Number(value));

/** Larger first; an unknown figure goes last in either direction rather than posing as zero. */
function byNumberDesc(a: number | null, b: number | null) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

const SORTERS: Record<ItemSort, (a: ResultItem, b: ResultItem) => number> = {
  sold: (a, b) => byNumberDesc(number(a.unitsSold), number(b.unitsSold)),
  revenue: (a, b) => byNumberDesc(number(a.netRevenue.value), number(b.netRevenue.value)),
  "gp-percent": (a, b) => byNumberDesc(number(a.gpPercent.value), number(b.gpPercent.value)),
  name: (a, b) => a.name.localeCompare(b.name),
};

/** Search by name, narrow by filter, then order. Never mutates its input. */
export function viewItems(
  items: ResultItem[],
  { query, filter, sort }: { query: string; filter: ItemFilter; sort: ItemSort },
): ResultItem[] {
  const needle = query.trim().toLowerCase();
  return items
    .filter((item) => MATCHES[filter](item))
    .filter((item) => !needle || item.name.toLowerCase().includes(needle))
    .sort((a, b) => SORTERS[sort](a, b) || a.name.localeCompare(b.name));
}

/** Units and revenue across the rows on show. Unknown values add nothing; they are not zeros. */
export function totals(items: ResultItem[]): { unitsSold: string; netRevenue: string } {
  let units = 0;
  let revenue = 0;
  for (const item of items) {
    units += number(item.unitsSold) ?? 0;
    revenue += number(item.netRevenue.value) ?? 0;
  }
  return { unitsSold: String(units), netRevenue: revenue.toFixed(2) };
}
