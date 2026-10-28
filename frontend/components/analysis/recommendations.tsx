"use client";

import { Lightbulb } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ResultsResponse } from "@/lib/api/types";
import { showItemRow } from "@/lib/audit/jump";
import { formatMoney } from "@/lib/format";

type Recommendation = ResultsResponse["recommendations"][number];

const TOP = 3;

const KINDS: Record<string, { label: string; tone: string }> = {
  PRICE: { label: "Price", tone: "bg-brand-soft text-brand-ink" },
  COST: { label: "Cost", tone: "bg-info-soft text-info" },
  MENU_MIX: { label: "Menu mix", tone: "bg-violet-soft text-violet" },
  DATA_QUALITY: { label: "Data", tone: "bg-warning-soft text-warning" },
};
const FALLBACK_KIND = { label: "Idea", tone: "bg-muted text-muted-foreground" };

/**
 * The analysis's own suggestions, the same ones that go into the Excel workbook, most useful
 * first. These are rules applied to the figures, not the assistant's opinion, and the money is
 * "about": it assumes sales stay as they were.
 */
export function Recommendations({
  recommendations,
  currency,
}: {
  recommendations: Recommendation[];
  currency: string;
}) {
  const [showAll, setShowAll] = useState(false);
  if (recommendations.length === 0) return null;

  const ordered = [...recommendations].sort((a, b) => a.priority - b.priority);
  const visible = showAll ? ordered : ordered.slice(0, TOP);

  function showItem(menuItemId: string) {
    if (!showItemRow(menuItemId)) {
      toast.info("That item is hidden by the search or filter above the table. Choose “All”.");
    }
  }

  return (
    <Card className="w-full shadow-sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-4 text-brand" aria-hidden />
          <h2 className="text-base font-semibold tracking-tight">Recommendations</h2>
        </div>
        <ol className="flex flex-col divide-y">
          {visible.map((item) => (
            <li
              key={`${item.priority}-${item.title}`}
              className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex flex-wrap items-start gap-2.5">
                <span
                  className={`mt-px rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tracking-wider uppercase ${(KINDS[item.kind] ?? FALLBACK_KIND).tone}`}
                >
                  {(KINDS[item.kind] ?? FALLBACK_KIND).label}
                </span>
                <p className="min-w-0 flex-1 text-[13.5px] leading-snug font-semibold">{item.title}</p>
                {item.impactGp && (
                  <span className="ml-auto text-[12.5px] font-semibold whitespace-nowrap text-brand-ink">
                    about +{formatMoney(item.impactGp, currency)} gross profit
                  </span>
                )}
              </div>
              <p className="text-[12.5px] text-muted-foreground">{item.body}</p>
              {item.menuItemId && (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 text-brand-ink"
                    onClick={() => showItem(item.menuItemId as string)}
                  >
                    Show item
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
        {ordered.length > TOP && (
          <div>
            <Button variant="outline" size="sm" onClick={() => setShowAll((open) => !open)}>
              {showAll ? "Show fewer" : `Show all ${ordered.length}`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
