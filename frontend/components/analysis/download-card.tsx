"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, api } from "@/lib/api/client";

/**
 * Builds the workbook for the current revision and downloads it through a one-time link,
 * so the file always matches the figures on screen.
 */
export function DownloadCard({
  jobId,
  token,
  revision,
  incomplete = false,
}: {
  jobId: string;
  token: string;
  revision: number;
  /** A file could not be read, so the workbook lacks its data. */
  incomplete?: boolean;
}) {
  const download = useMutation({
    mutationFn: async () => {
      const report = await api.createExport(jobId, token);
      const link = await api.createDownloadLink(jobId, token, report.exportId);
      return api.absoluteUrl(link.url);
    },
    onSuccess: (url) => {
      // A one-time link: navigate to it directly rather than opening a tab that may be blocked.
      window.location.assign(url);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "The download could not be prepared.",
      ),
  });

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
          <FileSpreadsheet className="size-5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold">
            {incomplete ? "Your analysis is incomplete" : "Your analysis is ready"}
          </p>
          <p className="text-sm text-muted-foreground">
            {incomplete
              ? "A file could not be read, so this workbook is missing its data."
              : "Excel workbook with sales, costing, recommendations and what still needs review."}
            {revision > 0 && ` Includes your ${revision} confirmed change${revision === 1 ? "" : "s"}.`}
          </p>
        </div>
        <Button
          onClick={() => download.mutate()}
          disabled={download.isPending}
          className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-600/90 sm:w-auto"
        >
          {download.isPending ? <Loader2 className="animate-spin" /> : <Download />}
          Download Excel
        </Button>
      </CardContent>
    </Card>
  );
}
