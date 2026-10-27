"use client";

import type { Metric, ResultItem } from "@/lib/api/types";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Menu-engineering class, in the words the Excel workbook uses. */
const CLASS_LABELS: Record<NonNullable<ResultItem["matrixClass"]>, string> = {
  STAR: "Star",
  PLOWHORSE: "Plowhorse",
  PUZZLE: "Puzzle",
  DOG: "Dog",
};

/**
 * Every menu item and its figures, best sellers first.
 *
 * The numbers come straight from the analysis, not from the assistant, so they are always
 * the confirmed ones. A figure that is not known stays an em dash — never a zero, which
 * would read as "this dish makes no profit" rather than "we could not work it out".
 */
export function ItemsTable({ items, currency }: { items: ResultItem[]; currency: string }) {
  if (items.length === 0) return null;

  const byUnitsSold = [...items].sort(
    (a, b) => Number(b.unitsSold ?? 0) - Number(a.unitsSold ?? 0),
  );

  return (
    <div className="border-t pt-4">
      <div className="-mx-2 overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums">
          <caption className="sr-only">
            Menu items with their sales, price, cost and gross profit
          </caption>
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="px-2 py-2 text-left font-medium">
                Item
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Sold
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
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
              <tr key={item.menuItemId} className="border-b last:border-0">
                <th scope="row" className="px-2 py-2 text-left font-medium">
                  {item.name}
                </th>
                <td className="px-2 py-2 text-right">{formatNumber(item.unitsSold)}</td>
                <MetricCell metric={item.netPrice} format={(v) => formatMoney(v, currency)} />
                <MetricCell metric={item.costPerPortion} format={(v) => formatMoney(v, currency)} />
                <MetricCell metric={item.gpPerPortion} format={(v) => formatMoney(v, currency)} />
                <MetricCell metric={item.gpPercent} format={formatPercent} />
                <td className="px-2 py-2 text-left text-muted-foreground">
                  {item.matrixClass ? CLASS_LABELS[item.matrixClass] : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-2 pt-3 text-xs text-muted-foreground">
        A dash means the figure could not be worked out yet, not zero. Figures marked{" "}
        <span className="italic">est.</span> are estimates — hover to see why.
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
  const isEstimate = metric.confidence === "ESTIMATED" && metric.value !== null;

  return (
    <td
      className={cn("px-2 py-2 text-right", isEstimate && "text-muted-foreground")}
      title={metric.reasons.length > 0 ? metric.reasons.join(" ") : undefined}
    >
      {format(metric.value)}
      {isEstimate && <span className="ml-1 text-xs italic">est.</span>}
    </td>
  );
}
