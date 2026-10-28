"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { AnalysisFooter } from "@/components/analysis/analysis-footer";
import { AnalysisProgress } from "@/components/analysis/analysis-progress";
import { AnalysisSummary } from "@/components/analysis/analysis-summary";
import { ChatPanel } from "@/components/analysis/chat-panel";
import { DownloadCard } from "@/components/analysis/download-card";
import { IncompleteBanner } from "@/components/analysis/incomplete-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, api } from "@/lib/api/client";
import { useJobToken } from "@/lib/api/job-session";
import { unreadFiles } from "@/lib/audit/incomplete";

const POLL_INTERVAL_MS = 2000;

/**
 * The analysis screen. It resolves the access token (from the link fragment or local
 * storage), polls while processing, then shows the summary, the assistant and the download.
 */
export function AnalysisWorkspace({ jobId }: { jobId: string }) {
  const queryClient = useQueryClient();
  // The link fragment is browser-only, so the token resolves on the client.
  const { token, resolved: tokenResolved } = useJobToken(jobId);

  const status = useQuery({
    queryKey: ["job", jobId],
    enabled: Boolean(token),
    queryFn: () => api.status(jobId, token as string),
    refetchInterval: (query) => (query.state.data?.isActive ? POLL_INTERVAL_MS : false),
    retry: (failureCount, error) => !(error instanceof ApiError && error.isGone) && failureCount < 2,
  });

  const isReady = status.data?.status === "READY";

  const results = useQuery({
    queryKey: ["results", jobId, status.data?.currentRevision],
    enabled: Boolean(token) && isReady,
    queryFn: () => api.results(jobId, token as string),
    // Keep the table on screen while new figures load, so an edit never blanks it.
    placeholderData: keepPreviousData,
  });

  const retry = useMutation({
    mutationFn: () => api.retry(jobId, token as string),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["job", jobId] }),
  });

  if (!tokenResolved || (token && status.isPending)) {
    return <CenteredNote icon>Opening your analysis…</CenteredNote>;
  }
  if (!token) {
    return (
      <CenteredNote title="This link is incomplete">
        Open the analysis using the full link you were given, including the part after the
        &ldquo;#&rdquo;.
      </CenteredNote>
    );
  }
  if (status.error instanceof ApiError && status.error.isGone) {
    return (
      <CenteredNote title="This analysis is no longer available">
        Analyses and their files are deleted automatically after 48 hours. Start a new one to
        analyse your data again.
      </CenteredNote>
    );
  }
  if (status.error || !status.data) {
    return (
      <CenteredNote title="Could not load your analysis">
        {status.error instanceof ApiError ? status.error.message : "Please try again."}
      </CenteredNote>
    );
  }

  if (!isReady) {
    return (
      <AnalysisProgress
        status={status.data}
        onRetry={() => retry.mutate()}
        retrying={retry.isPending}
      />
    );
  }

  const unread = unreadFiles(status.data.files);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <IncompleteBanner files={unread} />
      {results.data ? (
        <>
          <AnalysisSummary
            results={results.data}
            jobId={jobId}
            token={token}
            refreshing={results.isFetching}
          />
          <DownloadCard
            jobId={jobId}
            token={token}
            revision={results.data.revision}
            incomplete={unread.length > 0}
          />
          <ChatPanel
            jobId={jobId}
            token={token}
            currency={results.data.currency}
            disabled={false}
          />
        </>
      ) : (
        <CenteredNote icon>Loading your results…</CenteredNote>
      )}
      <AnalysisFooter jobId={jobId} token={token} expiresAt={status.data.expiresAt} />
    </div>
  );
}

function CenteredNote({
  title,
  children,
  icon,
}: {
  title?: string;
  children: React.ReactNode;
  icon?: boolean;
}) {
  return (
    <Card className="w-full max-w-xl">
      <CardContent className="flex flex-col items-center gap-3 text-center">
        {icon && <Loader2 className="size-6 animate-spin text-muted-foreground" />}
        {title && <p className="font-semibold">{title}</p>}
        <p className="text-sm text-muted-foreground">{children}</p>
        {!icon && (
          <Button asChild variant="outline" size="sm">
            <Link href="/">Start a new analysis</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
