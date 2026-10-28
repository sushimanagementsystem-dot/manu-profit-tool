import { CircleDollarSign, Gauge, TrendingUp, UtensilsCrossed } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { ResultItem, ResultsResponse } from "@/lib/api/types";
import { unlinkedSales } from "@/lib/audit/figures";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tone = "green" | "blue" | "violet" | "amber";

const TONES: Record<Tone, string> = {
  green: "bg-brand-soft text-brand-ink",
  blue: "bg-info-soft text-info",
  violet: "bg-violet-soft text-violet",
  amber: "bg-warning-soft text-warning",
};

/**
 * The four headline figures. Gross profit is the hero because it is the number the client came
 * for; cost coverage sits last with a meter, since every other figure is only as complete as it
 * is. Each card says what its figure leaves out, so the totals can be trusted or questioned.
 */
export function SummaryCards({
  summary,
  items,
  currency,
  refreshing,
}: {
  summary: ResultsResponse["summary"];
  items: ResultItem[];
  currency: string;
  /** The figures are being recalculated after a change. */
  refreshing: boolean;
}) {
  const coverage = Math.min(100, Math.max(0, Number(summary.revenueCoveredPercent ?? 0)));
  const complete = summary.itemsTotal > 0 && summary.itemsCosted === summary.itemsTotal;
  const missing = summary.itemsTotal - summary.itemsCosted;
  const unlinked = unlinkedSales(summary, items);

  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-3.5 transition-opacity xl:grid-cols-4",
        refreshing && "opacity-60",
      )}
    >
      <Stat
        icon={<TrendingUp />}
        tone="green"
        label="Net revenue"
        value={formatMoney(summary.netRevenue, currency)}
        hint={
          unlinked.revenue > 0 ? (
            <>
              <b>{formatMoney(String(unlinked.revenue), currency)}</b> of it is not linked to a
              menu item yet
            </>
          ) : (
            "Sales without VAT"
          )
        }
      />
      <Stat
        icon={<UtensilsCrossed />}
        tone="blue"
        label="Items sold"
        value={formatNumber(summary.unitsSold)}
        hint={
          <>
            {summary.itemsTotal} menu items
            {unlinked.units > 0 && (
              <>
                {" "}
                · <b>{formatNumber(String(unlinked.units))}</b> sold but not linked
              </>
            )}
          </>
        }
      />
      <Stat
        icon={<CircleDollarSign />}
        tone="green"
        hero
        label="Gross profit"
        badge={formatPercent(summary.gpPercent)}
        value={formatMoney(summary.realisedGp, currency)}
        hint={
          <>
            On the <b>{summary.itemsCosted} of {summary.itemsTotal}</b> dishes with a cost
          </>
        }
      />
      <Stat
        icon={<Gauge />}
        tone="amber"
        label="Cost coverage"
        value={String(summary.itemsCosted)}
        valueSuffix={`of ${summary.itemsTotal} dishes`}
        hint={
          <>
            <b>{formatPercent(summary.revenueCoveredPercent)}</b> of revenue
            {missing > 0 && ` · ${missing} ${missing === 1 ? "dish needs" : "dishes still need"} a cost`}
          </>
        }
      >
        <div
          role="meter"
          aria-label="Share of revenue with a known cost"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(coverage)}
          className="mt-2 h-[7px] overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              "h-full rounded-full",
              complete ? "bg-brand" : "bg-gradient-to-r from-warning/70 to-warning",
            )}
            style={{ width: `${coverage}%` }}
          />
        </div>
      </Stat>
    </dl>
  );
}

function Stat({
  icon,
  tone,
  label,
  badge,
  value,
  valueSuffix,
  hint,
  hero = false,
  children,
}: {
  icon: React.ReactNode;
  tone: Tone;
  label: string;
  badge?: string;
  value: string;
  valueSuffix?: string;
  hint: React.ReactNode;
  hero?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card className={cn("w-full shadow-sm", hero && "border-brand-line bg-gradient-to-b from-brand-soft to-card")}>
      <CardContent className="flex flex-col gap-1">
        <dt className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] font-medium text-muted-foreground">
          <span
            className={cn(
              "grid size-[30px] shrink-0 place-items-center rounded-[9px] [&_svg]:size-4",
              TONES[tone],
            )}
            aria-hidden
          >
            {icon}
          </span>
          {label}
          {badge && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] font-semibold text-brand-ink">
              {badge}
            </span>
          )}
        </dt>
        <dd className="m-0 flex flex-col">
          <span className="mt-1.5 text-[22px] leading-[1.1] sm:text-[28px] font-semibold tracking-tight tabular-nums">
            {value}
            {valueSuffix && (
              <span className="ml-1.5 text-base font-medium text-muted-foreground">{valueSuffix}</span>
            )}
          </span>
          {children}
          <span className="mt-1 text-[12.5px] text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground/80">
            {hint}
          </span>
        </dd>
      </CardContent>
    </Card>
  );
}
