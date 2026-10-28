"use client";

import { AlertTriangle, Info, TriangleAlert } from "lucide-react";

import { AttentionStrip } from "@/components/analysis/attention-strip";
import { ItemsTable } from "@/components/analysis/items-table";
import { SummaryCards } from "@/components/analysis/summary-cards";
import { Card, CardContent } from "@/components/ui/card";
import type { ResultsResponse } from "@/lib/api/types";

const SEVERITY_STYLES = {
  critical: { icon: TriangleAlert, className: "text-destructive" },
  warning: { icon: AlertTriangle, className: "text-warning" },
  info: { icon: Info, className: "text-muted-foreground" },
};

/**
 * The headline figures and what still needs attention. Release 1 keeps this short on
 * purpose: the detail lives in the Excel file and in the chat.
 */
export function AnalysisSummary({
  results,
  jobId,
  token,
  refreshing,
}: {
  results: ResultsResponse;
  jobId: string;
  token: string;
  /** The figures are being recalculated after a change. */
  refreshing: boolean;
}) {
  const { summary, currency } = results;

  return (
    <div className="flex w-full flex-col gap-4">
      <SummaryCards summary={summary} currency={currency} refreshing={refreshing} />
      <AttentionStrip results={results} />
      <Card className="w-full">
        <CardContent className="flex flex-col gap-5">
          <ItemsTable
            items={results.items}
            currency={currency}
            jobId={jobId}
            token={token}
            refreshing={refreshing}
          />

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
    </div>
  );
}
