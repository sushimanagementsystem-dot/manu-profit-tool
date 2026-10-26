import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AuditStatus } from "@/lib/audit/types";

type Report = { fileName: string; sizeBytes: number } | undefined;

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STYLES: Record<
  AuditStatus,
  { container: string; icon: typeof CheckCircle2; iconClassName: string }
> = {
  uploaded: {
    container: "border-border bg-muted/30",
    icon: Loader2,
    iconClassName: "animate-spin text-muted-foreground",
  },
  processing: {
    container: "border-border bg-muted/30",
    icon: Loader2,
    iconClassName: "animate-spin text-muted-foreground",
  },
  review_required: {
    container: "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10",
    icon: AlertTriangle,
    iconClassName: "text-amber-500",
  },
  completed: {
    container: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10",
    icon: CheckCircle2,
    iconClassName: "text-emerald-500",
  },
  failed: {
    container: "border-destructive/30 bg-destructive/5",
    icon: XCircle,
    iconClassName: "text-destructive",
  },
};

const TITLES: Record<AuditStatus, string> = {
  uploaded: "Starting audit…",
  processing: "Processing your files…",
  review_required: "Review required",
  completed: "Your report is ready!",
  failed: "Audit failed",
};

export function AuditStatusBanner({
  auditId,
  status,
  message,
  report,
}: {
  auditId: string;
  status: AuditStatus;
  message?: string;
  report?: Report;
}) {
  const style = STYLES[status];
  const Icon = style.icon;

  return (
    <div
      className={`flex w-full flex-col items-center gap-4 rounded-2xl border p-5 text-center animate-in fade-in slide-in-from-bottom-2 duration-500 sm:flex-row sm:text-left ${style.container}`}
    >
      <Icon className={`size-10 shrink-0 ${style.iconClassName}`} />
      <div className="flex-1">
        <p className="font-semibold">{TITLES[status]}</p>
        <p className="text-sm text-muted-foreground">
          {message ??
            (status === "processing" || status === "uploaded"
              ? "This usually takes a minute or two."
              : "")}
        </p>
      </div>
      {status === "completed" && report && (
        <Button asChild className="w-full bg-emerald-600 text-white hover:bg-emerald-600/90 sm:w-auto">
          <a href={`/api/audits/${auditId}/report`} download={report.fileName}>
            <Download />
            Download Report ({formatBytes(report.sizeBytes)})
          </a>
        </Button>
      )}
    </div>
  );
}
