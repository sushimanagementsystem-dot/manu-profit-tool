"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EditableCell } from "@/components/analysis/editable-cell";
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
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Menu-engineering class, in the words the Excel workbook uses. */
const CLASS_LABELS: Record<NonNullable<ResultItem["matrixClass"]>, string> = {
  STAR: "Star",
  PLOWHORSE: "Plowhorse",
  PUZZLE: "Puzzle",
  DOG: "Dog",
};

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

  const byUnitsSold = [...items].sort(
    (a, b) => Number(b.unitsSold ?? 0) - Number(a.unitsSold ?? 0),
  );
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
    <div className="border-t pt-4" aria-busy={busy}>
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
            "w-full min-w-[48rem] border-collapse text-sm tabular-nums transition-opacity",
            busy && "opacity-60",
          )}
        >
          <caption className="sr-only">
            Menu items with their sales, price, cost and gross profit. Names, units sold, menu
            prices and costs can be edited.
          </caption>
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="px-2 py-2 text-left font-medium">
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
              <th scope="col" className="px-2 py-2 text-left font-medium">
                Class
              </th>
            </tr>
          </thead>
          <tbody>
            {byUnitsSold.map((item) => (
              <tr
                key={item.menuItemId}
                className={cn(
                  "border-b transition-colors duration-700 last:border-0",
                  changed.includes(item.menuItemId) && "bg-emerald-500/10",
                )}
              >
                <th scope="row" className="px-2 py-1.5 text-left font-medium">
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
                    {formatMoney(item.costPerPortion.value, currency)}
                    {item.costSource === "MANUAL" && (
                      <span className="ml-1 text-xs italic text-muted-foreground">set</span>
                    )}
                    {isEstimate(item.costPerPortion) && <span className="ml-1 text-xs italic">est.</span>}
                  </EditableCell>
                </td>
                <MetricCell metric={item.gpPerPortion} format={(v) => formatMoney(v, currency)} />
                <MetricCell metric={item.gpPercent} format={formatPercent} />
                <td className="px-2 py-1.5 text-left text-muted-foreground">
                  {item.matrixClass ? CLASS_LABELS[item.matrixClass] : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-2 pt-3 text-xs text-muted-foreground">
        Click a name, units sold, menu price or cost to edit it. Everything is recalculated and the
        Excel file follows. Leave a cost empty to go back to the recipe. A dash means the figure
        could not be worked out yet, not zero. Figures marked <span className="italic">est.</span>{" "}
        are estimates — hover to see why.
      </p>
    </div>
  );
}

const isEstimate = (metric: Metric) => metric.confidence === "ESTIMATED" && metric.value !== null;

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
