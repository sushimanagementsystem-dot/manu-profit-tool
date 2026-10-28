"use client";

import { AlertTriangle, ArrowRight, Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ChatProposal, ImpactPreview } from "@/lib/api/types";
import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The confirmation step: the assistant prepares a change, this shows exactly what it would
 * do and what it does to the numbers, and nothing is saved until the client confirms.
 */
export function ProposalCard({
  proposal,
  impact,
  currency,
  pending,
  onConfirm,
  onCancel,
}: {
  proposal: ChatProposal;
  impact: ImpactPreview | null;
  currency: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const applied = proposal.status === "APPROVED";
  const decided = proposal.status !== "PROPOSED";
  const { summary } = impact ?? {};
  const delta = summary?.deltaGp ?? null;
  const showTotal = summary && summary.realisedGpAfter !== null && delta !== null && Number(delta) !== 0;

  // Once decided the card shrinks to one line: the message above already says what the change was.
  if (decided) {
    return (
      <p
        className={cn(
          "flex items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px]",
          applied
            ? "border-brand-line bg-brand-soft text-brand-ink"
            : "bg-muted/50 text-muted-foreground",
        )}
      >
        {applied ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
        {applied ? "Applied to your analysis" : "Not applied"}
      </p>
    );
  }

  return (
    <div className="rounded-[14px] border border-warning-line bg-warning-soft p-3.5 text-sm">
      <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-warning uppercase">
        <AlertTriangle className="size-3.5" aria-hidden />
        Waiting for your OK
      </p>
      <p className="mt-1.5 font-medium">{proposal.summary}</p>

      {impact && (
        <ul className="mt-2.5 flex flex-col gap-2 text-[13px]">
          {impact.items.slice(0, 5).map((item) => (
            <li key={item.menuItemId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-medium">{item.name}</span>
              <span className="ml-auto flex items-center gap-1.5 text-muted-foreground tabular-nums">
                {item.gpPerPortionBefore && (
                  <>
                    <span>{formatMoney(item.gpPerPortionBefore, currency)}</span>
                    <ArrowRight className="size-3" aria-hidden />
                  </>
                )}
                <b className="rounded-md bg-brand-soft px-1.5 py-px font-semibold text-brand-ink">
                  {formatMoney(item.gpPerPortionAfter, currency)}
                </b>
                {item.gpPercentAfter && <span className="text-xs">({formatPercent(item.gpPercentAfter)})</span>}
              </span>
            </li>
          ))}
          <li className="sr-only">Profit per portion, before and after.</li>
        </ul>
      )}

      {showTotal && summary && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-dashed border-warning-line pt-3 text-[12.5px] text-foreground/70">
          Gross profit
          {summary.realisedGpBefore !== null && (
            <>
              <span className="tabular-nums">{formatMoney(summary.realisedGpBefore, currency)}</span>
              <ArrowRight className="size-3" aria-hidden />
            </>
          )}
          <b className="font-semibold text-brand-ink tabular-nums">
            {formatMoney(summary.realisedGpAfter, currency)}
          </b>
          <span className={cn("font-semibold tabular-nums", Number(delta) > 0 ? "text-brand-ink" : "text-destructive")}>
            ({Number(delta) > 0 ? "+" : ""}
            {formatMoney(delta, currency)})
          </span>
        </p>
      )}

      {summary && summary.itemsCostedAfter > summary.itemsCostedBefore && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Dishes with a complete cost: {summary.itemsCostedBefore} → {summary.itemsCostedAfter}.
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex gap-2">
          <Button size="lg" onClick={onConfirm} disabled={pending} className="gap-1.5">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Apply changes
          </Button>
          <Button size="lg" variant="outline" onClick={onCancel} disabled={pending} className="gap-1.5 bg-card">
            Discard
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Nothing changes in your analysis until you apply it.</p>
      </div>
    </div>
  );
}
