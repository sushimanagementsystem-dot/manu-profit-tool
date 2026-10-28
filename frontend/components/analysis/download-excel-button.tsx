"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api/client";

/**
 * Builds the workbook for the current revision and downloads it through a one-time link,
 * so the file always matches the figures on screen.
 */
export function DownloadExcelButton({
  jobId,
  token,
  revision,
  incomplete,
}: {
  jobId: string;
  token: string;
  /** How many confirmed changes the workbook will include; 0 until the results have loaded. */
  revision: number;
  /** A file could not be read, so the workbook lacks its data. */
  incomplete: boolean;
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

  const changes = revision > 0 ? `${revision} change${revision === 1 ? "" : "s"}` : null;

  return (
    <Button
      onClick={() => download.mutate()}
      disabled={download.isPending}
      title={
        incomplete
          ? "A file could not be read, so this workbook is missing its data."
          : changes
            ? `Includes your ${changes}`
            : undefined
      }
      className="gap-2 bg-brand font-semibold text-brand-foreground shadow-sm hover:bg-brand/90"
    >
      {download.isPending ? <Loader2 className="animate-spin" /> : <Download />}
      <span className="sm:hidden">Excel</span>
      <span className="hidden sm:inline">
        {incomplete ? "Download (incomplete)" : "Download Excel"}
      </span>
      {changes && !incomplete && (
        <span className="hidden text-xs font-medium opacity-80 md:inline">· {changes}</span>
      )}
    </Button>
  );
}
