"use client";

import { AttentionStrip } from "@/components/analysis/attention-strip";
import { IssuesPanel } from "@/components/analysis/issues-panel";
import { ItemsTable } from "@/components/analysis/items-table";
import { Recommendations } from "@/components/analysis/recommendations";
import { SummaryCards } from "@/components/analysis/summary-cards";
import { Card, CardContent } from "@/components/ui/card";
import type { ResultsResponse } from "@/lib/api/types";

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
        </CardContent>
      </Card>
      <IssuesPanel issues={results.issues} />
      <Recommendations recommendations={results.recommendations} currency={currency} />
    </div>
  );
}
