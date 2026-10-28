"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { AnalysisFooter } from "@/components/analysis/analysis-footer";
import { AnalysisProgress } from "@/components/analysis/analysis-progress";
import { AnalysisSummary } from "@/components/analysis/analysis-summary";
import { ChatPanel } from "@/components/analysis/chat-panel";
import { AnalysisHeader } from "@/components/analysis/analysis-header";
import { IncompleteBanner } from "@/components/analysis/incomplete-banner";
import { BrandHeader } from "@/components/audit/brand-header";
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
    return (
      <StateShell>
        <CenteredNote icon>Opening your analysis…</CenteredNote>
      </StateShell>
    );
  }
  if (!token) {
    return (
      <StateShell>
        <CenteredNote title="This link is incomplete">
          Open the analysis using the full link you were given, including the part after the
          &ldquo;#&rdquo;.
        </CenteredNote>
      </StateShell>
    );
  }
  if (status.error instanceof ApiError && status.error.isGone) {
    return (
      <StateShell>
        <CenteredNote title="This analysis is no longer available">
          Analyses and their files are deleted automatically after 48 hours. Start a new one to
          analyse your data again.
        </CenteredNote>
      </StateShell>
    );
  }
  if (status.error || !status.data) {
    return (
      <StateShell>
        <CenteredNote title="Could not load your analysis">
          {status.error instanceof ApiError ? status.error.message : "Please try again."}
        </CenteredNote>
      </StateShell>
    );
  }

  if (!isReady) {
    return (
      <StateShell>
        <AnalysisProgress
          status={status.data}
          onRetry={() => retry.mutate()}
          retrying={retry.isPending}
        />
      </StateShell>
    );
  }

  const unread = unreadFiles(status.data.files);

  return (
    <>
      <AnalysisHeader
        jobId={jobId}
        token={token}
        expiresAt={status.data.expiresAt}
        revision={results.data?.revision ?? 0}
        incomplete={unread.length > 0}
      />
      <div className="mx-auto grid w-full max-w-[1488px] items-start gap-6 px-3.5 py-6 sm:px-6 min-[1180px]:grid-cols-[minmax(0,1fr)_372px]">
        <main id="figures" tabIndex={-1} className="flex min-w-0 flex-col gap-[18px] outline-none">
          <IncompleteBanner files={unread} />
          {results.data ? (
            <AnalysisSummary
              results={results.data}
              filesRead={status.data.files.filter((file) => file.status === "PROCESSED").length}
              jobId={jobId}
              token={token}
              refreshing={results.isFetching}
            />
          ) : (
            <CenteredNote icon>Loading your results…</CenteredNote>
          )}
          <AnalysisFooter jobId={jobId} token={token} expiresAt={status.data.expiresAt} />
        </main>
        <aside
          aria-label="Assistant"
          className="h-[640px] min-[1180px]:sticky min-[1180px]:top-20 min-[1180px]:h-[calc(100vh-6.5rem)] min-[1180px]:max-h-[900px] min-[1180px]:min-h-[560px]"
        >
          <ChatPanel
            jobId={jobId}
            token={token}
            currency={results.data?.currency ?? "EUR"}
            disabled={false}
            fill
          />
        </aside>
      </div>
    </>
  );
}

/**
 * Everything that is not a ready analysis (opening, failed, expired, still working) keeps the
 * narrow centred look it has always had; only a ready analysis uses the wide layout.
 */
function StateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-6 py-12">
      <BrandHeader />
      {children}
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
