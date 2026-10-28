"use client";

import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { formatCalls, formatUsd } from "@/lib/audit/ai-cost";

/**
 * What the AI cost for this analysis, for clients who are testing the product and want to see
 * what Claude costs per analysis. The server decides whether to send it (`SHOW_AI_COST`): when it
 * is off this renders nothing. To take it out for good, delete this file and its one line in
 * `analysis-workspace.tsx`; nothing else depends on it.
 */
export function AiCostCard({ jobId, token }: { jobId: string; token: string }) {
  const usage = useQuery({
    queryKey: ["ai-cost", jobId],
    queryFn: () => api.aiUsage(jobId, token),
    // A failure to load a testing aid is not worth telling the client about.
    retry: false,
  });

  if (!usage.data?.enabled) return null;
  const { extraction, chat, totalUsd, note } = usage.data;

  const rows = [
    { label: "Reading your files", part: extraction },
    { label: "Assistant (chat)", part: chat },
  ];

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
            <Coins className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold">AI cost of this analysis</p>
            <p className="text-sm text-muted-foreground">
              Shown while you test the product, so you can see what Claude costs per analysis.
            </p>
          </div>
          <p className="text-lg font-semibold tabular-nums">{formatUsd(totalUsd)}</p>
        </div>
        <dl className="flex flex-col gap-1 border-t pt-3 text-sm">
          {rows.map(({ label, part }) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">
                {label} <span className="text-xs">({formatCalls(part.calls)})</span>
              </dt>
              <dd className="tabular-nums">{formatUsd(part.costUsd)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}
