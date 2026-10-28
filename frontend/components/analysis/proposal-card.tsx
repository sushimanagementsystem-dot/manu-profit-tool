"use client";

import { Check, Loader2, X } from "lucide-react";

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

  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-sm",
        applied && "border-brand-line bg-brand-soft",
        !decided && "border-warning-line bg-warning-soft",
        decided && !applied && "bg-muted/50",
      )}
    >
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {applied ? "Applied" : decided ? "Not applied" : "Proposed change"}
      </p>
      <p className="mt-1 font-medium">{proposal.summary}</p>

      {impact && (
        <div className="mt-3 flex flex-col gap-2 text-xs">
          {impact.items.slice(0, 5).map((item) => (
            <div key={item.menuItemId} className="flex flex-col gap-0.5">
              <span className="font-medium">{item.name}</span>
              <span className="text-muted-foreground">
                Profit per portion{" "}
                {item.gpPerPortionBefore && (
                  <>
                    <span className="tabular-nums line-through">
                      {formatMoney(item.gpPerPortionBefore, currency)}
                    </span>{" "}
                    →{" "}
                  </>
                )}
                <span className="font-medium text-foreground tabular-nums">
                  {formatMoney(item.gpPerPortionAfter, currency)}
                </span>
                {item.gpPercentAfter ? ` (${formatPercent(item.gpPercentAfter)})` : ""}
              </span>
            </div>
          ))}

          {showTotal && summary && (
            <div className="flex flex-col gap-0.5 border-t pt-2">
              <span className="text-muted-foreground">Total gross profit</span>
              <span className="tabular-nums">
                {summary.realisedGpBefore !== null && (
                  <>
                    <span className="text-muted-foreground line-through">
                      {formatMoney(summary.realisedGpBefore, currency)}
                    </span>{" "}
                    →{" "}
                  </>
                )}
                <span className="font-semibold">
                  {formatMoney(summary.realisedGpAfter, currency)}
                </span>{" "}
                <span
                  className={cn(
                    "font-medium",
                    Number(delta) > 0 ? "text-brand-ink" : "text-destructive",
                  )}
                >
                  ({Number(delta) > 0 ? "+" : ""}
                  {formatMoney(delta, currency)})
                </span>
              </span>
            </div>
          )}

          {summary && summary.itemsCostedAfter > summary.itemsCostedBefore && (
            <p className="text-muted-foreground">
              Items with a complete cost: {summary.itemsCostedBefore} → {summary.itemsCostedAfter}.
            </p>
          )}
        </div>
      )}

      {!decided && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={pending}
              className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Apply change
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onCancel}
              disabled={pending}
              className="gap-1.5"
            >
              <X className="size-3.5" />
              Discard
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Nothing changes in your analysis until you apply it.
          </p>
        </div>
      )}
    </div>
  );
}
