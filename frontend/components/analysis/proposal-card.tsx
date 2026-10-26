"use client";

import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ChatProposal, ImpactPreview } from "@/lib/api/types";
import { formatMoney, formatPercent } from "@/lib/format";

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
  const decided = proposal.status !== "PROPOSED";
  const delta = impact?.summary.deltaGp;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm dark:border-amber-500/25 dark:bg-amber-500/10">
      <p className="font-medium">{proposal.summary}</p>

      {impact && (
        <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
          {impact.items.slice(0, 5).map((item) => (
            <div key={item.menuItemId} className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="font-medium text-foreground">{item.name}</span>
              <span>
                profit per portion{" "}
                {item.gpPerPortionBefore
                  ? `${formatMoney(item.gpPerPortionBefore, currency)} → `
                  : ""}
                <span className="font-medium text-foreground">
                  {formatMoney(item.gpPerPortionAfter, currency)}
                </span>
                {item.gpPercentAfter ? ` (${formatPercent(item.gpPercentAfter)})` : ""}
              </span>
            </div>
          ))}
          {delta && Number(delta) !== 0 && (
            <p>
              Total gross profit changes by{" "}
              <span className="font-medium text-foreground">{formatMoney(delta, currency)}</span>.
            </p>
          )}
          {impact.summary.itemsCostedAfter > impact.summary.itemsCostedBefore && (
            <p>
              Items with a complete cost: {impact.summary.itemsCostedBefore} →{" "}
              {impact.summary.itemsCostedAfter}.
            </p>
          )}
        </div>
      )}

      {decided ? (
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          {proposal.status === "APPROVED" ? "Applied to your analysis." : "Not applied."}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onConfirm} disabled={pending} className="gap-1.5">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Apply change
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel} disabled={pending} className="gap-1.5">
            <X className="size-3.5" />
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}
