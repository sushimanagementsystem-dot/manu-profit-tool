"use client";

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { JobStatusResponse, JobStatus } from "@/lib/api/types";

const STAGE_LABELS: Partial<Record<JobStatus, string>> = {
  QUEUED: "Getting started…",
  EXTRACTING: "Reading your files…",
  NORMALIZING: "Organising products and units…",
  MATCHING: "Matching sales to menu items…",
  CALCULATING: "Calculating profitability…",
};

const LEVEL_ICONS = {
  info: { icon: Info, className: "text-muted-foreground" },
  warning: { icon: AlertTriangle, className: "text-amber-500" },
  error: { icon: XCircle, className: "text-destructive" },
};

/** Shown while a submitted analysis is still being processed, and when it fails. */
export function AnalysisProgress({
  status,
  onRetry,
  retrying,
}: {
  status: JobStatusResponse;
  onRetry: () => void;
  retrying: boolean;
}) {
  const failed = status.status === "FAILED";
  const { progress } = status;

  return (
    <Card className="w-full max-w-xl">
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          {failed ? (
            <XCircle className="size-7 shrink-0 text-destructive" />
          ) : (
            <Loader2 className="size-7 shrink-0 animate-spin text-muted-foreground" />
          )}
          <div className="flex-1">
            <p className="font-semibold">
              {failed ? "The analysis could not be completed" : (STAGE_LABELS[status.status] ?? "Working…")}
            </p>
            <p className="text-sm text-muted-foreground">
              {failed
                ? (status.failure?.message ?? "Something went wrong.")
                : "This usually takes a minute or two. You can leave this page open."}
            </p>
          </div>
        </div>

        {!failed && (
          <div className="flex flex-col gap-1.5">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Analysis progress"
            >
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
                style={{ width: `${Math.max(progress.percent, 3)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {progress.totalTasks > 0
                ? `${progress.completedTasks} of ${progress.totalTasks} files processed`
                : "Preparing your files"}
            </p>
          </div>
        )}

        {progress.messages.length > 0 && (
          <ul className="flex flex-col gap-2 border-t pt-4">
            {progress.messages.map((message, index) => {
              const { icon: Icon, className } = LEVEL_ICONS[message.level];
              return (
                <li key={`${message.code}-${index}`} className="flex items-start gap-2 text-sm">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} />
                  <span className="text-muted-foreground">{message.text}</span>
                </li>
              );
            })}
          </ul>
        )}

        {status.files.length > 0 && (
          <ul className="flex flex-col gap-1.5 border-t pt-4 text-sm">
            {status.files.map((file) => (
              <li key={file.id} className="flex items-center gap-2">
                {file.status === "PROCESSED" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                ) : file.status === "FAILED" ? (
                  <XCircle className="size-4 shrink-0 text-destructive" />
                ) : (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">{file.originalName}</span>
              </li>
            ))}
          </ul>
        )}

        {failed && (
          <Button variant="outline" onClick={onRetry} disabled={retrying} className="self-start">
            {retrying ? <Loader2 className="animate-spin" /> : null}
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
