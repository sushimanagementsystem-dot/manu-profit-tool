"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EditableCell } from "@/components/analysis/editable-cell";
import { TableToolbar } from "@/components/analysis/table-toolbar";
import { ApiError, api } from "@/lib/api/client";
import type { Metric, ResultItem } from "@/lib/api/types";
import { changedItemIds } from "@/lib/audit/item-diff";
import {
  buildOperations,
  FIELD_LABELS,
  startValue,
  validateEdit,
  type EditField,
} from "@/lib/audit/item-edit";
import {
  filterCounts,
  isEstimate,
  totals,
  viewItems,
  type ItemFilter,
  type ItemSort,
} from "@/lib/audit/item-view";
import { itemRowId } from "@/lib/audit/jump";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Menu-engineering class, in the words the Excel workbook uses, with what it tells the owner. */
const CLASS_LABELS: Record<NonNullable<ResultItem["matrixClass"]>, string> = {
  STAR: "Star",
  PLOWHORSE: "Plowhorse",
  PUZZLE: "Puzzle",
  DOG: "Dog",
};

const CLASS_HINTS: Record<NonNullable<ResultItem["matrixClass"]>, string> = {
  STAR: "Sells well and earns well: protect it.",
  PLOWHORSE: "Sells well but earns little: look at its cost or price.",
  PUZZLE: "Earns well but sells little: promote it.",
  DOG: "Sells little and earns little: consider dropping it.",
};

const CLASS_STYLES: Record<NonNullable<ResultItem["matrixClass"]>, string> = {
  STAR: "border-brand-line bg-brand-soft text-brand-ink",
  PLOWHORSE: "border-warning-line bg-warning-soft text-warning",
  PUZZLE: "border-border bg-muted text-foreground",
  DOG: "border-destructive-line bg-destructive-soft text-destructive",
};

/** The item column stays in view while the figures scroll sideways on a phone. */
const FROZEN = "sticky left-0 z-10 bg-card px-2 shadow-[1px_0_0_var(--border)]";

/** How long a row stays highlighted after an edit changed it. */
const HIGHLIGHT_MS = 3000;

type Editing = { id: string; field: EditField } | null;

/**
 * Every menu item and its figures, best sellers first. Names, units sold, menu prices and costs
 * can be edited in place; each edit goes through the same revision pipeline as a change confirmed
 * in the chat, so the headline figures, the recommendations, the assistant and the Excel
 * workbook all move together.
 *
 * The numbers come straight from the analysis, not from the assistant, so they are always
 * the confirmed ones. A figure that is not known stays an em dash — never a zero, which
 * would read as "this dish makes no profit" rather than "we could not work it out".
 */
export function ItemsTable({
  items,
  currency,
  jobId,
  token,
  refreshing = false,
}: {
  items: ResultItem[];
  currency: string;
  jobId: string;
  token: string;
  /** The results are being fetched again, whatever started it (an edit here, or the chat). */
  refreshing?: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Editing>(null);
  const [changed, setChanged] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [sort, setSort] = useState<ItemSort>("sold");
  const previous = useRef<ResultItem[] | null>(null);

  const apply = useMutation({
    mutationFn: (operations: Parameters<typeof api.applyChanges>[2]) =>
      api.applyChanges(jobId, token, operations),
    // Waiting for the refetch keeps the editor on "saving" until the new figures are on screen.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["results", jobId] });
      void queryClient.invalidateQueries({ queryKey: ["exports", jobId] });
    },
  });

  // Highlight whatever the results changed, whether the edit came from this table or the chat.
  useEffect(() => {
    const before = previous.current;
    previous.current = items;
    if (!before) return;
    const ids = changedItemIds(before, items);
    if (!ids.length) return;
    setChanged(ids);
    const timer = window.setTimeout(() => setChanged([]), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [items]);

  if (items.length === 0) return null;

  const shown = viewItems(items, { query, filter, sort });
  const sums = totals(shown);
  const busy = apply.isPending || refreshing;
  const changedNames = items.filter((item) => changed.includes(item.menuItemId)).map((item) => item.name);

  async function save(item: ResultItem, field: EditField, value: string) {
    const operations = buildOperations(field, item, value);
    if (!operations) return; // the same value again: nothing to record
    try {
      await apply.mutateAsync(operations);
    } catch (error) {
      // Keep the server's wording ("No POS sales are linked…"); the cell shows it and stays open.
      throw new Error(
        error instanceof ApiError ? error.message : "Could not save. Check your connection and try again.",
      );
    }
    toast.success(`${item.name}: ${FIELD_LABELS[field]} updated.`);
  }

  const cell = (item: ResultItem, field: EditField) => ({
    editing: editing?.id === item.menuItemId && editing.field === field,
    onEditingChange: (open: boolean) => setEditing(open ? { id: item.menuItemId, field } : null),
    disabled: apply.isPending || (editing !== null && !(editing.id === item.menuItemId && editing.field === field)),
    startValue: startValue(field, item),
    validate: (raw: string) => validateEdit(field, raw),
    onSave: (value: string) => save(item, field, value),
  });

  return (
    <div aria-busy={busy} className="flex flex-col gap-3">
      <TableToolbar
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        counts={filterCounts(items)}
        sort={sort}
        onSortChange={setSort}
      />
      <div className="flex h-5 items-center justify-end gap-1.5 px-2 text-xs text-muted-foreground" aria-live="polite">
        {busy ? (
          <>
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Recalculating…
          </>
        ) : (
          changedNames.length > 0 && <span className="sr-only">Figures updated for {changedNames.join(", ")}.</span>
        )}
      </div>
      <div className="-mx-2 overflow-x-auto">
        <table
          className={cn(
            "w-full min-w-[58rem] border-collapse text-sm tabular-nums transition-opacity",
            busy && "opacity-60",
          )}
        >
          <caption className="sr-only">
            Menu items with their sales, price, cost and gross profit. Names, units sold, menu
            prices and costs can be edited.
          </caption>
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className={cn(FROZEN, "py-2 text-left font-medium")}>
                Item
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Sold
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium" title="The price on your menu">
                Menu price
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium" title="Menu price without VAT">
                Net price
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Cost
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                GP / portion
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                GP %
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium" title="Net price times units sold">
                Revenue
              </th>
              <th scope="col" className="px-2 py-2 text-left font-medium">
                Class
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((item) => (
              <tr
                key={item.menuItemId}
                id={itemRowId(item.menuItemId)}
                className={cn(
                  "scroll-mt-24 border-b transition-colors duration-700 last:border-0",
                  changed.includes(item.menuItemId) && "bg-brand-soft",
                )}
              >
                <th scope="row" className={cn(FROZEN, "py-1.5 text-left font-medium", changed.includes(item.menuItemId) && "bg-brand-soft")}>
                  <EditableCell
                    {...cell(item, "name")}
                    label={`name of ${item.name}`}
                    kind="text"
                    align="left"
                  >
                    {item.name}
                  </EditableCell>
                </th>
                <td className="px-2 py-1.5 text-right">
                  <EditableCell
                    {...cell(item, "unitsSold")}
                    label={`units sold of ${item.name}`}
                    kind="decimal"
                    align="right"
                  >
                    {formatNumber(item.unitsSold)}
                  </EditableCell>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <EditableCell
                    {...cell(item, "grossPrice")}
                    label={`menu price of ${item.name}`}
                    kind="decimal"
                    align="right"
                  >
                    {formatMoney(item.grossPrice, currency)}
                  </EditableCell>
                </td>
                <MetricCell metric={item.netPrice} format={(v) => formatMoney(v, currency)} />
                <td
                  className={cn(
                    "px-2 py-1.5 text-right",
                    isEstimate(item.costPerPortion) && "text-muted-foreground",
                  )}
                  title={item.costPerPortion.reasons.length > 0 ? item.costPerPortion.reasons.join(" ") : undefined}
                >
                  <EditableCell
                    {...cell(item, "cost")}
                    label={`cost per portion of ${item.name}`}
                    kind="decimal"
                    align="right"
                    placeholder="empty = use recipe"
                  >
                    {item.costPerPortion.value === null ? (
                      <span className="text-xs font-medium text-brand-ink">+ Add cost</span>
                    ) : (
                      formatMoney(item.costPerPortion.value, currency)
                    )}
                    {item.costSource === "MANUAL" && (
                      <span className="ml-1 text-xs italic text-muted-foreground">set</span>
                    )}
                    {isEstimate(item.costPerPortion) && <span className="ml-1 text-xs italic">est.</span>}
                  </EditableCell>
                </td>
                <MetricCell metric={item.gpPerPortion} format={(v) => formatMoney(v, currency)} />
                <MetricCell metric={item.gpPercent} format={formatPercent} />
                <MetricCell metric={item.netRevenue} format={(v) => formatMoney(v, currency)} />
                <td className="px-2 py-1.5 text-left">
                  {item.matrixClass ? (
                    <span
                      title={CLASS_HINTS[item.matrixClass]}
                      className={cn(
                        "inline-block rounded-full border px-2 py-0.5 text-xs font-medium",
                        CLASS_STYLES[item.matrixClass],
                      )}
                    >
                      {CLASS_LABELS[item.matrixClass]}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="px-2 py-8 text-center text-muted-foreground">
                  No items match. Clear the search or choose &ldquo;All&rdquo;.
                </td>
              </tr>
            )}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr className="border-t-2 text-sm font-semibold">
                <th scope="row" className={cn(FROZEN, "py-2 text-left")}>
                  {shown.length === items.length ? "Total" : `Total of ${shown.length} shown`}
                </th>
                <td className="px-2 py-2 text-right">{formatNumber(sums.unitsSold)}</td>
                <td colSpan={5} />
                <td className="px-2 py-2 text-right">{formatMoney(sums.netRevenue, currency)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="px-2 text-xs text-muted-foreground">
        Click a name, units sold, menu price or cost to edit it. Everything is recalculated and the
        Excel file follows. Leave a cost empty to go back to the recipe. A dash means the figure
        could not be worked out yet, not zero. <span className="italic">est.</span> marks an
        estimate and <span className="italic">set</span> a cost you entered — hover to see why.
        Totals cover the rows shown.
      </p>
    </div>
  );
}

/** One figure, flagged when it is an estimate rather than something the data proves. */
function MetricCell({
  metric,
  format,
}: {
  metric: Metric;
  format: (value: string | null) => string;
}) {
  const estimate = isEstimate(metric);

  return (
    <td
      className={cn("px-2 py-1.5 text-right", estimate && "text-muted-foreground")}
      title={metric.reasons.length > 0 ? metric.reasons.join(" ") : undefined}
    >
      {format(metric.value)}
      {estimate && <span className="ml-1 text-xs italic">est.</span>}
    </td>
  );
}
