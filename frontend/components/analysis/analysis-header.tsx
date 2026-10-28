import { Clock, Plus } from "lucide-react";
import Link from "next/link";

import { CopyLinkButton } from "@/components/analysis/copy-link-button";
import { DownloadExcelButton } from "@/components/analysis/download-excel-button";
import { BrandHeader } from "@/components/audit/brand-header";
import { Button } from "@/components/ui/button";
import { formatTimeLeft } from "@/lib/format";

/**
 * The bar across the top of a ready analysis: who we are on the left; what you can do with this
 * analysis on the right (keep the link, start another, take the workbook). It stays in view while
 * the table scrolls.
 */
export function AnalysisHeader({
  jobId,
  token,
  expiresAt,
  revision,
  incomplete,
}: {
  jobId: string;
  token: string;
  expiresAt: string;
  revision: number;
  incomplete: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1488px] items-center gap-2 px-4 sm:px-6">
        <div className="mr-auto shrink-0 whitespace-nowrap">
          <BrandHeader />
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground lg:inline-flex">
          <Clock className="size-3.5" aria-hidden />
          Deleted automatically {formatTimeLeft(expiresAt)}
        </span>
        <CopyLinkButton jobId={jobId} token={token} />
        <Button asChild variant="ghost" className="hidden gap-2 md:inline-flex">
          <Link href="/">
            <Plus />
            New analysis
          </Link>
        </Button>
        <DownloadExcelButton
          jobId={jobId}
          token={token}
          revision={revision}
          incomplete={incomplete}
        />
      </div>
    </header>
  );
}
