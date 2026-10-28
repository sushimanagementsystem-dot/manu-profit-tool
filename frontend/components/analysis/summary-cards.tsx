import { Card, CardContent } from "@/components/ui/card";
import type { ResultsResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

/**
 * The four headline figures. Gross profit is the hero (brand colour) because it is the number the
 * client came for; cost coverage sits last with a meter, since every other figure is only as
 * complete as it is.
 */
export function SummaryCards({
  summary,
  currency,
  refreshing,
}: {
  summary: ResultsResponse["summary"];
  currency: string;
  /** The figures are being recalculated after a change. */
  refreshing: boolean;
}) {
  const coverage = Math.min(100, Math.max(0, Number(summary.revenueCoveredPercent ?? 0)));
  const complete = summary.itemsTotal > 0 && summary.itemsCosted === summary.itemsTotal;

  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-3 transition-opacity xl:grid-cols-4",
        refreshing && "opacity-60",
      )}
    >
      <Stat label="Net revenue" value={formatMoney(summary.netRevenue, currency)} />
      <Stat label="Items sold" value={formatNumber(summary.unitsSold)} />
      <Stat
        label="Gross profit"
        value={formatMoney(summary.realisedGp, currency)}
        hint={`${formatPercent(summary.gpPercent)} of net revenue`}
        hero
      />
      <Stat
        label="Cost coverage"
        value={`${summary.itemsCosted} of ${summary.itemsTotal}`}
        hint={`${formatPercent(summary.revenueCoveredPercent)} of revenue`}
      >
        <div
          role="meter"
          aria-label="Share of revenue with a known cost"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(coverage)}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full", complete ? "bg-brand" : "bg-warning")}
            style={{ width: `${coverage}%` }}
          />
        </div>
      </Stat>
    </dl>
  );
}

function Stat({
  label,
  value,
  hint,
  hero = false,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  hero?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card className={cn("w-full", hero && "border-brand-line bg-brand-soft")}>
      <CardContent className="flex flex-col gap-1">
        <dt className={cn("text-xs font-medium", hero ? "text-brand-ink" : "text-muted-foreground")}>
          {label}
        </dt>
        <dd className="m-0 flex flex-col">
          <span
            className={cn(
              "text-2xl font-semibold tabular-nums tracking-tight",
              hero && "text-brand-ink",
            )}
          >
            {value}
          </span>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
          {children}
        </dd>
      </CardContent>
    </Card>
  );
}
