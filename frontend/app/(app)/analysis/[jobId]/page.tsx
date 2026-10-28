import { Loader2 } from "lucide-react";
import { Suspense } from "react";

import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";
import { BrandHeader } from "@/components/audit/brand-header";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Cache Components require a static shell, so reading `params` happens inside the Suspense
 * boundary rather than in the page body — the header and the loading card prerender.
 *
 * A ready analysis is wide (table beside the assistant) and its header spans the screen, so this
 * page steps out of the shared shell's padding (`-mx-6 -my-12`) rather than changing the shell,
 * which the upload page also uses and must keep exactly as it is.
 */
export default function AnalysisPage({ params }: PageProps<"/analysis/[jobId]">) {
  return (
    <div className="-mx-6 -my-12 flex flex-col self-stretch">
      <Suspense fallback={<Opening />}>
        <Workspace params={params} />
      </Suspense>
    </div>
  );
}

async function Workspace({ params }: { params: PageProps<"/analysis/[jobId]">["params"] }) {
  const { jobId } = await params;
  return <AnalysisWorkspace jobId={jobId} />;
}

function Opening() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-6 py-12">
      <BrandHeader />
      <Card className="w-full max-w-xl">
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Opening your analysis…</p>
        </CardContent>
      </Card>
    </div>
  );
}
