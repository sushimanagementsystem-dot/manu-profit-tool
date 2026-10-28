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

const KIND_LABELS: Record<string, string> = {
  PRICE: "Price",
  COST: "Cost",
  MENU_MIX: "Menu mix",
  DATA_QUALITY: "Data",
};

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
    <Card className="w-full">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-4 text-brand" aria-hidden />
          <h2 className="text-sm font-semibold">Recommendations</h2>
        </div>
        <ol className="flex flex-col divide-y">
          {visible.map((item) => (
            <li
              key={`${item.priority}-${item.title}`}
              className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {KIND_LABELS[item.kind] ?? "Idea"}
                </span>
                <p className="text-sm font-medium">{item.title}</p>
                {item.impactGp && (
                  <span className="ml-auto text-xs font-medium whitespace-nowrap text-brand-ink">
                    about +{formatMoney(item.impactGp, currency)} gross profit
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{item.body}</p>
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
