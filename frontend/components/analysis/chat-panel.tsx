"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { ProposalCard } from "@/components/analysis/proposal-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
    <Card className={cn("w-full", fill && "h-full min-h-0")}>
      <CardContent className={cn("flex flex-col gap-4", fill && "h-full min-h-0")}>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-emerald-500" />
          <h2 className="text-sm font-semibold">Ask or correct</h2>
        </div>

        {disabled ? (
          <p className="text-sm text-muted-foreground">
            The assistant becomes available once the analysis is ready.
          </p>
        ) : (
          <>
            <div
              className={cn(
                "flex flex-col gap-3 overflow-y-auto",
                fill ? "min-h-0 flex-1" : "max-h-[26rem]",
              )}
            >
              {messages.length === 0 && !pendingQuestion && (
                <p className="text-sm text-muted-foreground">
                  Ask about your results, or tell me what is wrong — for example &ldquo;the burger
                  is €14.50, not €12&rdquo; or &ldquo;a burger uses 180g of beef&rdquo;. I will
                  prepare the change for you to confirm.
                </p>
              )}

              {messages.map((message) => (
                <Bubble key={message.id} message={message}>
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
                </Bubble>
              ))}

              {pendingQuestion && (
                <>
                  <Bubble message={{ role: "USER", content: pendingQuestion } as ChatMessage} />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Looking at your analysis…
                  </div>
                </>
              )}
              <div ref={endRef} />
            </div>

            {messages.length === 0 && !pendingQuestion && (
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => submit(suggestion)}
                    className="cursor-pointer rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            <form
              className="flex gap-2"
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
              />
              <Button type="submit" disabled={send.isPending || !draft.trim()} aria-label="Send">
                {send.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <SendHorizontal />
                )}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Bubble({
  message,
  children,
}: {
  message: Pick<ChatMessage, "role" | "content">;
  children?: React.ReactNode;
}) {
  const isUser = message.role === "USER";
  return (
    <div className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {message.content}
      </div>
      {children && <div className="w-full max-w-[85%]">{children}</div>}
    </div>
  );
}
