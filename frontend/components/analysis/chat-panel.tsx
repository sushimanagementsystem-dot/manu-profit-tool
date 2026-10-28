"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { ProposalCard } from "@/components/analysis/proposal-card";
import { Button } from "@/components/ui/button";
import { AiCostLine } from "@/components/analysis/ai-cost-line";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api/client";
import type { ChatMessage, ImpactPreview } from "@/lib/api/types";
import { ASSISTANT_INPUT_ID } from "@/lib/audit/jump";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Which items make me the most profit?",
  "Which dishes are least profitable?",
  "What if I raise my best seller by €1?",
];

/**
 * The assistant panel — in Release 1 this is also how the client corrects the analysis:
 * they describe what is wrong, the assistant prepares a change, and they confirm it here.
 */
export function ChatPanel({
  jobId,
  token,
  currency,
  disabled,
  fill = false,
}: {
  jobId: string;
  token: string;
  currency: string;
  disabled: boolean;
  /** Take the full height of the container, scrolling the messages inside it. */
  fill?: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [impacts, setImpacts] = useState<Record<string, ImpactPreview>>({});
  const endRef = useRef<HTMLDivElement>(null);

  const history = useQuery({
    queryKey: ["chat", jobId],
    queryFn: () => api.chatHistory(jobId, token),
    enabled: !disabled,
  });

  const messages = history.data ?? [];
  const waiting = messages.filter((message) => message.proposal?.status === "PROPOSED").length;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: (content: string) => api.sendChat(jobId, token, content),
    onSuccess: (reply) => {
      if (reply.proposal) {
        setImpacts((current) => ({ ...current, [reply.proposal!.revisionId]: reply.proposal!.impact }));
      }
      void queryClient.invalidateQueries({ queryKey: ["chat", jobId] });
      // Every answer costs something; the cost card, when it is on, picks the new figure up.
      void queryClient.invalidateQueries({ queryKey: ["ai-cost", jobId] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "The assistant did not reply."),
  });

  const decide = useMutation({
    mutationFn: async ({ revisionId, approve }: { revisionId: string; approve: boolean }) => {
      if (approve) await api.approveRevision(jobId, token, revisionId);
      else await api.rejectRevision(jobId, token, revisionId);
    },
    onSuccess: (_result, variables) => {
      if (variables.approve) toast.success("Your analysis has been updated.");
      void queryClient.invalidateQueries({ queryKey: ["chat", jobId] });
      void queryClient.invalidateQueries({ queryKey: ["results", jobId] });
      void queryClient.invalidateQueries({ queryKey: ["exports", jobId] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "The change could not be applied."),
  });

  function submit(content: string) {
    const text = content.trim();
    if (!text || send.isPending) return;
    setDraft("");
    send.mutate(text);
  }

  // Shown immediately so the question appears while the assistant is still thinking.
  const pendingQuestion = send.isPending ? send.variables : null;

  return (
    <Card className={cn("w-full gap-0 overflow-hidden py-0 shadow-sm", fill && "h-full min-h-0")}>
      <div className="flex items-center gap-2.5 border-b px-4 py-3.5">
        <span
          className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-brand/70 to-brand text-brand-foreground"
          aria-hidden
        >
          <Sparkles className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] leading-tight font-semibold">Assistant</h2>
          <p className="text-xs text-muted-foreground">Answers come from your analysis</p>
        </div>
        {waiting > 0 ? (
          <span className="ml-auto rounded-full border border-warning-line bg-warning-soft px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap text-warning">
            {waiting} waiting for your OK
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-brand-ink">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden />
            Ready
          </span>
        )}
      </div>

      {disabled ? (
        <p className="p-4 text-sm text-muted-foreground">
          The assistant becomes available once the analysis is ready.
        </p>
      ) : (
        <>
          <div
            className={cn(
              "flex flex-col gap-3 overflow-y-auto px-4 py-3.5",
              fill ? "min-h-0 flex-1" : "max-h-[26rem]",
            )}
          >
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  disabled={send.isPending}
                  className="cursor-pointer rounded-full border bg-card px-3 py-1.5 text-left text-[12.5px] text-foreground/70 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {messages.length === 0 && !pendingQuestion && (
              <p className="text-[13px] text-muted-foreground">
                Ask about your results, or tell me what is wrong — for example &ldquo;the burger is
                &euro;14.50, not &euro;12&rdquo; or &ldquo;a burger uses 180g of beef&rdquo;. I will
                prepare the change and show it to you first; it is only applied when you say so.
              </p>
            )}

            {messages.map((message) => (
              <Message key={message.id} message={message}>
                {message.proposal && (
                  <ProposalCard
                    proposal={message.proposal}
                    impact={impacts[message.proposal.revisionId] ?? null}
                    currency={currency}
                    pending={decide.isPending && decide.variables?.revisionId === message.proposal.revisionId}
                    onConfirm={() =>
                      decide.mutate({ revisionId: message.proposal!.revisionId, approve: true })
                    }
                    onCancel={() =>
                      decide.mutate({ revisionId: message.proposal!.revisionId, approve: false })
                    }
                  />
                )}
              </Message>
            ))}

            {pendingQuestion && (
              <>
                <Message message={{ role: "USER", content: pendingQuestion, createdAt: "" }} />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Looking at your analysis…
                </div>
              </>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t bg-card px-3.5 py-3">
            <form
              className="flex items-center gap-2 rounded-xl border bg-card py-[5px] pr-[5px] pl-3 focus-within:ring-3 focus-within:ring-ring/40"
              onSubmit={(event) => {
                event.preventDefault();
                submit(draft);
              }}
            >
              <Input
                id={ASSISTANT_INPUT_ID}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask a question or describe a correction…"
                maxLength={2000}
                disabled={send.isPending}
                aria-label="Message to the assistant"
                className="h-9 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
              <Button
                type="submit"
                size="icon"
                disabled={send.isPending || !draft.trim()}
                aria-label="Send"
                className="size-9 rounded-[9px]"
              >
                {send.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
              </Button>
            </form>
            <AiCostLine jobId={jobId} token={token} />
          </div>
        </>
      )}
    </Card>
  );
}

/** "10:24", the time a message was written; nothing while it is still being sent. */
const timeOf = (iso: string) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";

function Message({
  message,
  children,
}: {
  message: Pick<ChatMessage, "role" | "content" | "createdAt">;
  children?: React.ReactNode;
}) {
  const isUser = message.role === "USER";
  return (
    <div className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[92%] rounded-[14px] px-3.5 py-2.5 text-[13.5px] leading-normal whitespace-pre-wrap",
          isUser
            ? "rounded-br-[5px] bg-foreground text-background"
            : "rounded-bl-[5px] border bg-muted/50 text-foreground",
        )}
      >
        {message.content}
        {!isUser && message.createdAt && (
          <span className="mt-1.5 block text-[11px] text-muted-foreground">{timeOf(message.createdAt)}</span>
        )}
      </div>
      {children && <div className="w-full">{children}</div>}
    </div>
  );
}
