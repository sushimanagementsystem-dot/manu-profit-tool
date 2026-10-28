"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
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
  STAR: "bg-brand-soft text-brand-ink",
  PLOWHORSE: "bg-info-soft text-info",
  PUZZLE: "bg-violet-soft text-violet",
  DOG: "bg-destructive-soft text-destructive",
};

/** Dish initial tiles take one of a few soft colours, the same for every dish of a category. */
const MONOGRAMS = [
  "bg-info-soft text-info",
  "bg-brand-soft text-brand-ink",
  "bg-warning-soft text-warning",
  "bg-violet-soft text-violet",
  "bg-destructive-soft text-destructive",
];
const monogramTone = (category: string | null) =>
  MONOGRAMS[[...(category ?? "")].reduce((sum, char) => sum + char.charCodeAt(0), 0) % MONOGRAMS.length];

/** Green from 70 % up, amber from 50 %, otherwise red: the same bands the owner reads GP % by. */
const gpBarTone = (percent: number) =>
  percent >= 70 ? "bg-brand" : percent >= 50 ? "bg-warning" : "bg-destructive";

/** The item column stays in view while the figures scroll sideways on a phone. */
const FROZEN = "sticky left-0 z-[1] bg-card px-2 shadow-[1px_0_0_var(--border)]";

/** A body cell: fixed row height, a hairline under it, a soft hover. */
const ROW = "h-[52px] border-b border-border/60 px-2 whitespace-nowrap bg-card group-hover/row:bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))] group-[.is-updated]/row:bg-brand-soft";
const FOOT = "h-[46px] border-t bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))] px-2";

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

  const th = "sticky top-0 z-[1] bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))] px-2 py-2.5 whitespace-nowrap text-[11.5px] font-semibold tracking-[0.02em] text-muted-foreground";

  return (
    <div aria-busy={busy} className="flex flex-col">
      <TableToolbar
        total={items.length}
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        counts={filterCounts(items)}
        sort={sort}
        onSortChange={setSort}
      />
      <div className="sr-only" aria-live="polite">
        {busy
          ? "Recalculating"
          : changedNames.length > 0 && `Figures updated for ${changedNames.join(", ")}.`}
      </div>
      <div className="relative overflow-x-auto border-t">
        {busy && (
          <span className="absolute top-2 right-3 z-[2] inline-flex items-center gap-1.5 rounded-full bg-card/90 px-2 py-0.5 text-xs text-muted-foreground shadow-sm">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Recalculating…
          </span>
        )}
        <table
          className={cn(
            "w-full min-w-[56rem] border-separate border-spacing-0 text-[13.5px] tabular-nums transition-opacity",
            busy && "opacity-60",
          )}
        >
          <caption className="sr-only">
            Menu items with their sales, price, cost and gross profit. Names, units sold, menu
            prices and costs can be edited.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={cn(th, FROZEN, "bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))] text-left")}>
                Item
              </th>
              <th scope="col" className={cn(th, "text-right", sort === "sold" && "text-foreground")}>
                Sold
              </th>
              <th scope="col" className={cn(th, "text-right")} title="The price on your menu">
                Menu price
              </th>
              <th scope="col" className={cn(th, "text-right")} title="Menu price without VAT">
                Net price
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Cost
              </th>
              <th scope="col" className={cn(th, "text-right")} title="Net price minus cost, per portion">
                GP / portion
              </th>
              <th scope="col" className={cn(th, "text-right", sort === "gp-percent" && "text-foreground")}>
                GP %
              </th>
              <th scope="col" className={cn(th, "text-right", sort === "revenue" && "text-foreground")} title="Net price times units sold">
                Revenue
              </th>
              <th scope="col" className={cn(th, "text-left")}>
                Class
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((item) => {
              const updated = changed.includes(item.menuItemId);
              const gp = item.gpPercent.value === null ? null : Number(item.gpPercent.value);
              return (
                <tr
                  key={item.menuItemId}
                  id={itemRowId(item.menuItemId)}
                  className={cn("group/row scroll-mt-24 transition-colors duration-700", updated && "is-updated")}
                >
                  <th
                    scope="row"
                    className={cn(
                      ROW,
                      FROZEN,
                      "text-left font-medium max-sm:max-w-[9.5rem] max-sm:whitespace-normal group-hover/row:bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))]",
                      updated && "bg-brand-soft shadow-[inset_3px_0_0_var(--brand),1px_0_0_var(--border)]",
                    )}
                  >
                    <div className="flex min-w-[7.25rem] items-center gap-2.5 sm:min-w-[9rem]">
                      <span
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-[9px] text-[13px] font-semibold max-sm:hidden",
                          monogramTone(item.category),
                        )}
                        aria-hidden
                      >
                        {item.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center">
                          <EditableCell
                            {...cell(item, "name")}
                            label={`name of ${item.name}`}
                            kind="text"
                            align="left"
                          >
                            {item.name}
                          </EditableCell>
                          {updated && (
                            <span className="ml-1.5 rounded-md bg-brand-soft px-1.5 py-px text-[10.5px] font-bold tracking-wide text-brand-ink uppercase">
                              Updated
                            </span>
                          )}
                        </div>
                        {item.category && (
                          <span className="block text-[11.5px] font-normal text-muted-foreground">
                            {item.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </th>
                  <td className={cn(ROW, "text-right", updated && "bg-brand-soft")}>
                    <EditableCell
                      {...cell(item, "unitsSold")}
                      label={`units sold of ${item.name}`}
                      kind="decimal"
                      align="right"
                    >
                      {formatNumber(item.unitsSold)}
                    </EditableCell>
                  </td>
                  <td className={cn(ROW, "text-right", updated && "bg-brand-soft")}>
                    <EditableCell
                      {...cell(item, "grossPrice")}
                      label={`menu price of ${item.name}`}
                      kind="decimal"
                      align="right"
                    >
                      {formatMoney(item.grossPrice, currency)}
                    </EditableCell>
                  </td>
                  <MetricCell
                    metric={item.netPrice}
                    format={(v) => formatMoney(v, currency)}
                    className={updated ? "bg-brand-soft" : undefined}
                  />
                  <td
                    className={cn(
                      ROW,
                      "text-right",
                      updated && "bg-brand-soft",
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
                      plain={item.costPerPortion.value === null}
                    >
                      {item.costPerPortion.value === null ? (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-dashed px-2 py-1 text-[12.5px] font-semibold text-warning hover:border-warning-line hover:bg-warning-soft">
                          <Plus className="size-3" aria-hidden />
                          Add cost
                        </span>
                      ) : (
                        formatMoney(item.costPerPortion.value, currency)
                      )}
                      {item.costSource === "MANUAL" && (
                        <span className="ml-1 text-[11px] italic text-muted-foreground">set</span>
                      )}
                      {isEstimate(item.costPerPortion) && <span className="ml-1 text-[11px] italic">est.</span>}
                    </EditableCell>
                  </td>
                  <MetricCell
                    metric={item.gpPerPortion}
                    format={(v) => formatMoney(v, currency)}
                    className={updated ? "bg-brand-soft" : undefined}
                  />
                  <td
                    className={cn(ROW, "text-right", updated && "bg-brand-soft", isEstimate(item.gpPercent) && "text-muted-foreground")}
                    title={item.gpPercent.reasons.length > 0 ? item.gpPercent.reasons.join(" ") : undefined}
                  >
                    {gp === null ? (
                      <span className="text-muted-foreground/60">—</span>
                    ) : (
                      <span className="inline-flex items-center justify-end gap-2">
                        <span className="h-[5px] w-[30px] overflow-hidden rounded-full bg-muted" aria-hidden>
                          <span
                            className={cn("block h-full rounded-full", gpBarTone(gp))}
                            style={{ width: `${Math.min(100, Math.max(0, gp))}%` }}
                          />
                        </span>
                        {formatPercent(item.gpPercent.value)}
                        {isEstimate(item.gpPercent) && <span className="text-[11px] italic">est.</span>}
                      </span>
                    )}
                  </td>
                  <MetricCell
                    metric={item.netRevenue}
                    format={(v) => formatMoney(v, currency)}
                    className={updated ? "bg-brand-soft" : undefined}
                  />
                  <td className={cn(ROW, "text-left", updated && "bg-brand-soft")}>
                    {item.matrixClass ? (
                      <span
                        title={CLASS_HINTS[item.matrixClass]}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold",
                          CLASS_STYLES[item.matrixClass],
                        )}
                      >
                        <span className="size-1.5 rounded-full bg-current" aria-hidden />
                        {CLASS_LABELS[item.matrixClass]}
                      </span>
                    ) : item.costPerPortion.value === null ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-warning">
                        <span className="size-1.5 rounded-full bg-current" aria-hidden />
                        Needs a cost
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
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
              <tr className="text-[13px] font-semibold">
                <th scope="row" className={cn(FOOT, FROZEN, "bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))] text-left text-foreground/70")}>
                  {shown.length === items.length ? "Total" : `Total of ${shown.length} shown`}
                </th>
                <td className={cn(FOOT, "text-right")}>{formatNumber(sums.unitsSold)}</td>
                <td colSpan={5} className={FOOT} />
                <td className={cn(FOOT, "text-right")}>{formatMoney(sums.netRevenue, currency)}</td>
                <td className={FOOT} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 border-t px-[18px] py-3 text-xs text-muted-foreground">
        <span>Click a name, units sold, menu price or cost to edit it. Everything is recalculated and the Excel file follows.</span>
        <span>
          <b className="font-semibold text-foreground/70">—</b> not worked out yet, not zero ·{" "}
          <i>est.</i> an estimate · <i>set</i> a cost you entered · empty cost = back to the recipe · totals
          cover the rows shown
        </span>
      </p>
    </div>
  );
}

/** One figure, flagged when it is an estimate rather than something the data proves. */
function MetricCell({
  metric,
  format,
  className,
}: {
  metric: Metric;
  format: (value: string | null) => string;
  className?: string;
}) {
  const estimate = isEstimate(metric);
  const unknown = metric.value === null;

  return (
    <td
      className={cn(ROW, "text-right", estimate && "text-muted-foreground", className)}
      title={metric.reasons.length > 0 ? metric.reasons.join(" ") : undefined}
    >
      {unknown ? <span className="text-muted-foreground/60">—</span> : format(metric.value)}
      {estimate && <span className="ml-1 text-[11px] italic">est.</span>}
    </td>
  );
}
