"use client";

import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ResultsResponse } from "@/lib/api/types";
import { issueCounts } from "@/lib/audit/figures";

/** Id of the "What to look at" panel, which the Review button scrolls to. */
export const ISSUES_ID = "issues";

/**
 * One box that says whether the figures can be trusted yet and how much is left to look at,
 * with a way to the details. The details are in the "What to look at" panel below the table.
 */
export function AttentionStrip({ issues }: { issues: ResultsResponse["issues"] }) {
  const counts = issueCounts(issues);

  function review() {
    const target = document.getElementById(ISSUES_ID);
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  if (counts.total === 0) {
    return (
      <Card
        role="status"
        className="flex-row items-center gap-3.5 border-brand-line bg-brand-soft px-4 py-3.5 shadow-none"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-card text-brand-ink" aria-hidden>
          <CheckCircle2 className="size-5" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-brand-ink">Nothing needs your attention</h2>
          <p className="text-[13px] text-muted-foreground">Every figure above is worked out from your data.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      role="status"
      className="flex-col items-stretch gap-3.5 border-warning-line bg-warning-soft px-4 py-3.5 shadow-none sm:flex-row sm:items-center"
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-warning-line/60 text-warning"
        aria-hidden
      >
        <AlertTriangle className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold">
          {counts.total} {counts.total === 1 ? "thing needs" : "things need"} attention
        </h2>
        <p className="text-[13px] text-foreground/70">
          The profit figures above are for the dishes with a cost. Complete these to see the whole
          menu.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px] font-semibold">
          {counts.critical > 0 && (
            <span className="rounded-full border border-destructive-line bg-destructive-soft px-2.5 py-0.5 text-destructive">
              {counts.critical} to fix first
            </span>
          )}
          {counts.warnings > 0 && (
            <span className="rounded-full border border-warning-line bg-card px-2.5 py-0.5 text-warning">
              {counts.warnings} {counts.warnings === 1 ? "warning" : "warnings"}
            </span>
          )}
          {counts.notes > 0 && (
            <span className="rounded-full border bg-card px-2.5 py-0.5 text-muted-foreground">
              {counts.notes} {counts.notes === 1 ? "note" : "notes"}
            </span>
          )}
        </div>
      </div>
      <Button variant="outline" onClick={review} className="gap-2 bg-card sm:self-center">
        Review
        <ArrowRight />
      </Button>
    </Card>
  );
}
