import { AlertTriangle, CheckCircle2 } from "lucide-react";

import type { ResultsResponse } from "@/lib/api/types";

/**
 * One line that says whether the figures can be trusted yet, and what is left to do. The detail
 * is in the table (items without a cost) and the issues list below it.
 */
export function AttentionStrip({ results }: { results: ResultsResponse }) {
  const { summary, issues, pendingMatches } = results;
  const uncosted = summary.itemsTotal - summary.itemsCosted;
  const problems = issues.filter((issue) => issue.severity !== "info").length;

  const todo = [
    uncosted > 0 && `${uncosted} ${uncosted === 1 ? "item needs" : "items need"} a cost`,
    pendingMatches.length > 0 &&
      `${pendingMatches.length} sales ${pendingMatches.length === 1 ? "line is" : "lines are"} not matched to a menu item`,
    problems > 0 && `${problems} ${problems === 1 ? "warning" : "warnings"} to read`,
  ].filter((part): part is string => Boolean(part));

  if (todo.length === 0) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-xl border border-brand-line bg-brand-soft px-4 py-3 text-sm text-brand-ink"
      >
        <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        Every menu item has a cost and nothing needs your attention.
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p>
        <span className="font-semibold">Before you rely on these figures: </span>
        {todo.join(" · ")}. Tell the assistant, or edit the cells below.
      </p>
    </div>
  );
}
