"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { formatCalls, formatUsd } from "@/lib/audit/ai-cost";

/**
 * What the AI cost for this analysis, one line under the message box, for clients who are testing
 * the product and want to see what Claude costs. The server decides whether to send it
 * (`SHOW_AI_COST`): when it is off this renders nothing. To take it out for good, delete this file
 * and its one line in `chat-panel.tsx`; nothing else depends on it.
 */
export function AiCostLine({ jobId, token }: { jobId: string; token: string }) {
  const usage = useQuery({
    queryKey: ["ai-cost", jobId],
    queryFn: () => api.aiUsage(jobId, token),
    // A failure to load a testing aid is not worth telling the client about.
    retry: false,
  });

  if (!usage.data?.enabled) return null;
  const { extraction, chat, totalUsd, note } = usage.data;
  const breakdown = `Reading your files: ${formatUsd(extraction.costUsd)} (${formatCalls(extraction.calls)}). Assistant: ${formatUsd(chat.costUsd)} (${formatCalls(chat.calls)}). ${note}`;

  return (
    <p className="mt-2.5 flex items-center justify-between text-[11.5px] text-muted-foreground" title={breakdown}>
      <span>
        AI cost of this analysis{" "}
        <b className="font-semibold text-foreground/80 tabular-nums">{formatUsd(totalUsd)}</b>
      </span>
      <span className="rounded-md bg-muted px-1.5 py-px text-[10.5px] font-bold tracking-wider uppercase">
        Testing
      </span>
    </p>
  );
}
