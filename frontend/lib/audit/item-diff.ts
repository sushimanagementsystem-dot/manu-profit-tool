import type { ResultItem } from "@/lib/api/types";

/** Everything on a row the client can see change; the id of an item that differs is "changed". */
const fingerprint = (item: ResultItem) =>
  [
    item.name,
    item.unitsSold,
    item.grossPrice,
    item.netPrice.value,
    item.costPerPortion.value,
    item.costSource,
    item.gpPerPortion.value,
    item.gpPercent.value,
    item.netRevenue.value,
    item.matrixClass,
  ].join("|");

/**
 * Ids of the rows whose figures differ between two versions of the results. This is how the table
 * shows what an edit (or a change confirmed in the chat) touched, including the rows it only
 * affected indirectly, such as a menu-engineering class that moved.
 */
export function changedItemIds(previous: ResultItem[], next: ResultItem[]): string[] {
  const before = new Map(previous.map((item) => [item.menuItemId, fingerprint(item)]));
  return next
    .filter((item) => before.has(item.menuItemId) && before.get(item.menuItemId) !== fingerprint(item))
    .map((item) => item.menuItemId);
}
