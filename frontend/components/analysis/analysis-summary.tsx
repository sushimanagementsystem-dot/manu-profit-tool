"use client";

import { AnalysisTitle } from "@/components/analysis/analysis-title";
import { AssumptionsRow } from "@/components/analysis/assumptions-row";
import { AttentionStrip } from "@/components/analysis/attention-strip";
import { IssuesPanel } from "@/components/analysis/issues-panel";
import { ItemsTable } from "@/components/analysis/items-table";
import { Recommendations } from "@/components/analysis/recommendations";
import { SummaryCards } from "@/components/analysis/summary-cards";
import { Card } from "@/components/ui/card";
import type { ResultsResponse } from "@/lib/api/types";

/**
 * The analysis itself, top to bottom: what it is, the four headline figures, whether they can be
 * trusted yet, what they were calculated with, every menu item, then what to look at and what to
 * do about it.
 */
export function AnalysisSummary({
  results,
  filesRead,
  jobId,
  token,
  refreshing,
}: {
  results: ResultsResponse;
  /** How many uploaded files were read. */
  filesRead: number;
  jobId: string;
  token: string;
  /** The figures are being recalculated after a change. */
  refreshing: boolean;
}) {
  const { summary, currency } = results;

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <AnalysisTitle filesRead={filesRead} changes={results.revision} />
      <SummaryCards summary={summary} items={results.items} currency={currency} refreshing={refreshing} />
      <AttentionStrip issues={results.issues} />
      <AssumptionsRow assumptions={results.assumptions} />
      <Card className="w-full gap-0 overflow-hidden py-0 shadow-sm">
        <ItemsTable
          items={results.items}
          currency={currency}
          jobId={jobId}
          token={token}
          refreshing={refreshing}
        />
      </Card>
      <div className="grid items-start gap-[18px] min-[1180px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <IssuesPanel issues={results.issues} />
        <Recommendations recommendations={results.recommendations} currency={currency} />
      </div>
    </div>
  );
}
