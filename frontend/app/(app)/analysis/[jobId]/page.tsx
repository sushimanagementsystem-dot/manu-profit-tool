import { Loader2 } from "lucide-react";
import { Suspense } from "react";

import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";
import { BrandHeader } from "@/components/audit/brand-header";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Cache Components require a static shell, so reading `params` happens inside the Suspense
 * boundary rather than in the page body — the header and the loading card prerender.
 */
export default function AnalysisPage({ params }: PageProps<"/analysis/[jobId]">) {
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-5">
      <BrandHeader />
      <Suspense fallback={<OpeningCard />}>
        <Workspace params={params} />
      </Suspense>
    </div>
  );
}

async function Workspace({ params }: { params: PageProps<"/analysis/[jobId]">["params"] }) {
  const { jobId } = await params;
  return <AnalysisWorkspace jobId={jobId} />;
}

function OpeningCard() {
  return (
    <Card className="w-full max-w-xl">
      <CardContent className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Opening your analysis…</p>
      </CardContent>
    </Card>
  );
}
