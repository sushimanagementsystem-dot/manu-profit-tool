"use client";

import { AlertTriangle, Info, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ResultsResponse } from "@/lib/api/types";
import { focusAssistant, showItemRow } from "@/lib/audit/jump";

type Issue = ResultsResponse["issues"][number];

const SEVERITY = {
  critical: { icon: TriangleAlert, className: "text-destructive", rank: 0 },
  warning: { icon: AlertTriangle, className: "text-warning", rank: 1 },
  info: { icon: Info, className: "text-muted-foreground", rank: 2 },
};

/**
 * What the analysis found wrong with its own inputs, worst first, each with the nearest way to
 * fix it: jump to the item it is about, or start telling the assistant. Informational notes are
 * kept but never given a button.
 */
export function IssuesPanel({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  const ordered = [...issues].sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank);

  function showItem(menuItemId: string) {
    if (!showItemRow(menuItemId)) {
      toast.info("That item is hidden by the search or filter above the table. Choose “All”.");
    }
  }

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">What to look at</h2>
        <ul className="flex flex-col divide-y">
          {ordered.map((issue, index) => {
            const { icon: Icon, className } = SEVERITY[issue.severity];
            return (
              <li
                key={`${issue.code}-${issue.menuItemId ?? index}`}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-3"
              >
                <div className="flex flex-1 items-start gap-2 text-sm">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-hidden />
                  <span className="text-muted-foreground">
                    <span className="sr-only">{issue.severity}: </span>
                    {issue.text}
                  </span>
                </div>
                {issue.severity !== "info" &&
                  (issue.menuItemId ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="self-start"
                      onClick={() => showItem(issue.menuItemId as string)}
                    >
                      Show item
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="self-start"
                      onClick={focusAssistant}
                    >
                      Tell the assistant
                    </Button>
                  ))}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
