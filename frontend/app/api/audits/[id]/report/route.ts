import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getAudit, getReportsDir } from "@/lib/audit/store";
import { isValidAuditId } from "@/lib/audit/types";

/**
 * Private download endpoint — the only way to get the generated report.
 * Access control for Phase 1 is "you have to know the audit ID (a UUID)";
 * there's no user-account check since auth isn't built yet (see flow.md's
 * open questions). Good enough for a prototype, not for production.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidAuditId(id)) {
    return NextResponse.json({ error: "Invalid audit id." }, { status: 400 });
  }

  const audit = await getAudit(id);
  if (!audit || audit.status !== "completed" || !audit.report) {
    return NextResponse.json(
      { error: "Report not available." },
      { status: 404 },
    );
  }

  const filePath = path.join(
    /* turbopackIgnore: true */ getReportsDir(),
    id,
    audit.report.fileName,
  );
  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    return NextResponse.json(
      { error: "Report file missing on disk." },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${audit.report.fileName}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
