"use client";

import { assumptionChips } from "@/lib/audit/figures";
import { focusAssistant } from "@/lib/audit/jump";
import type { ResultsResponse } from "@/lib/api/types";

/**
 * What the figures were worked out with, read-only. They are changed by telling the assistant,
 * which shows the change first like any other. Renders nothing when the server does not send
 * them (an older deployment).
 */
export function AssumptionsRow({ assumptions }: { assumptions: ResultsResponse["assumptions"] }) {
  if (!assumptions) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:pb-0.5">
      <span className="shrink-0">Calculated with</span>
      {assumptionChips(assumptions).map((chip) => (
        <span
          key={chip.label}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border bg-card/70 px-3 text-xs"
        >
          {chip.label} <b className="font-semibold text-foreground">{chip.value}</b>
        </span>
      ))}
      <button
        type="button"
        onClick={focusAssistant}
        className="shrink-0 cursor-pointer rounded-sm font-medium text-brand-ink outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Change with the assistant
      </button>
    </div>
  );
}
