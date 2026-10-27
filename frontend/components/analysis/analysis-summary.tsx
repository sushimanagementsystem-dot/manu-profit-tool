"use client";

import { AlertTriangle, Info, TriangleAlert } from "lucide-react";

import { ItemsTable } from "@/components/analysis/items-table";
import { Card, CardContent } from "@/components/ui/card";
import type { ResultsResponse } from "@/lib/api/types";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

const SEVERITY_STYLES = {
  critical: { icon: TriangleAlert, className: "text-destructive" },
  warning: { icon: AlertTriangle, className: "text-amber-500" },
  info: { icon: Info, className: "text-muted-foreground" },
};

/**
 * The headline figures and what still needs attention. Release 1 keeps this short on
 * purpose: the detail lives in the Excel file and in the chat.
 */
export function AnalysisSummary({ results }: { results: ResultsResponse }) {
  const { summary, currency } = results;
  const tiles = [
    { label: "Net revenue", value: formatMoney(summary.netRevenue, currency) },
    { label: "Items sold", value: formatNumber(summary.unitsSold) },
    { label: "Gross profit", value: formatMoney(summary.realisedGp, currency) },
    { label: "Gross profit %", value: formatPercent(summary.gpPercent) },
  ];

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{tile.label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{tile.value}</dd>
            </div>
          ))}
        </dl>

        <p className="border-t pt-4 text-sm text-muted-foreground">
          Costs are complete for{" "}
          <span className="font-medium text-foreground">
            {summary.itemsCosted} of {summary.itemsTotal}
          </span>{" "}
          menu items, covering {formatPercent(summary.revenueCoveredPercent)} of your revenue.
          {summary.itemsCosted < summary.itemsTotal &&
            " Tell the assistant below what goes into the missing dishes to complete it."}
        </p>

        <ItemsTable items={results.items} currency={currency} />

        {results.issues.length > 0 && (
          <ul className="flex flex-col gap-2 border-t pt-4">
            {results.issues.slice(0, 6).map((issue, index) => {
              const { icon: Icon, className } = SEVERITY_STYLES[issue.severity];
              return (
                <li key={`${issue.code}-${index}`} className="flex items-start gap-2 text-sm">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} />
                  <span className="text-muted-foreground">{issue.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
