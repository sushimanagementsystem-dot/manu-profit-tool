"use client";

import { AlertTriangle, Info, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { ISSUES_ID } from "@/components/analysis/attention-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ResultsResponse } from "@/lib/api/types";
import { issueCounts } from "@/lib/audit/figures";
import { focusAssistant, showItemRow } from "@/lib/audit/jump";

type Issue = ResultsResponse["issues"][number];

const SEVERITY = {
  critical: { icon: TriangleAlert, tile: "bg-destructive-soft text-destructive", rank: 0 },
  warning: { icon: AlertTriangle, tile: "bg-warning-soft text-warning", rank: 1 },
  info: { icon: Info, tile: "bg-muted text-muted-foreground", rank: 2 },
};

/**
 * What the analysis found wrong with its own inputs, worst first, each with the nearest way to
 * fix it: jump to the item it is about, or start telling the assistant. Informational notes are
 * kept but never given a button.
 */
export function IssuesPanel({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  const ordered = [...issues].sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank);
  const { critical, warnings } = issueCounts(issues);
  const urgent = critical + warnings;

  function showItem(menuItemId: string) {
    if (!showItemRow(menuItemId)) {
      toast.info("That item is hidden by the search or filter above the table. Choose “All”.");
    }
  }

  return (
    <Card id={ISSUES_ID} className="w-full scroll-mt-24 shadow-sm">
      <CardContent className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          What to look at
          {urgent > 0 && (
            <span className="rounded-full bg-destructive-soft px-2 py-px text-xs font-bold text-destructive">
              {urgent}
            </span>
          )}
        </h2>
        <ul className="flex flex-col">
          {ordered.map((issue, index) => {
            const { icon: Icon, tile } = SEVERITY[issue.severity];
            return (
              <li
                key={`${issue.code}-${issue.menuItemId ?? index}`}
                className="flex items-start gap-3 border-t py-3 first:border-t-0 first:pt-0 last:pb-0"
              >
                <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${tile}`} aria-hidden>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-foreground/75">
                    <span className="sr-only">{issue.severity}: </span>
                    {issue.text}
                  </p>
                  {issue.severity !== "info" && (
                    <div className="mt-2">
                      {issue.menuItemId ? (
                        <Button variant="outline" size="sm" onClick={() => showItem(issue.menuItemId as string)}>
                          Show item
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={focusAssistant}>
                          Tell the assistant
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
