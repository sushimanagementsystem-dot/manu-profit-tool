import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { UnreadFile } from "@/lib/audit/incomplete";

/**
 * Sits above the figures when a file could not be read. Without it a ready analysis with an empty
 * file looks complete (revenue 0, items sold 0) and the reason is only a line in the issue list.
 */
export function IncompleteBanner({ files }: { files: UnreadFile[] }) {
  if (!files.length) return null;
  const many = files.length > 1;

  return (
    <Card role="alert" className="w-full border-destructive/50 bg-destructive/5">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-semibold">
              {many ? `${files.length} files could not be read` : "1 file could not be read"}
            </p>
            <p className="text-sm text-muted-foreground">
              The figures below are incomplete, and so is the Excel workbook. Do not use them as a
              final result.
            </p>
          </div>
        </div>
        <ul className="flex flex-col gap-3 border-t pt-3">
          {files.map((file) => (
            <li key={file.id} className="text-sm">
              <p>
                <span className="font-medium">{file.name}</span>{" "}
                <span className="text-muted-foreground">({file.slot})</span>
              </p>
              <p className="text-muted-foreground">{file.reason}</p>
              <p className="font-medium text-destructive">{file.effect}</p>
            </li>
          ))}
        </ul>
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href="/">Fix the file and start again</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
