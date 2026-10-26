import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getN8nConfig } from "@/lib/audit/env";
import { getAudit, getReportsDir, updateAudit } from "@/lib/audit/store";
import { isValidAuditId, type AuditStatus } from "@/lib/audit/types";

const TERMINAL_STATUSES: AuditStatus[] = [
  "completed",
  "failed",
  "review_required",
];

function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9.\-_ ]/g, "_");
  return base || "report.xlsx";
}

/**
 * n8n calls this when the workflow finishes (success, failure, or needs
 * human review) — see n8n/menu-profit-workflow.json's final node. Requires
 * the x-callback-secret header so a guessed audit ID can't be used to fake
 * a result. When status=completed, the generated report file must be
 * attached as multipart form field "report" — we store it ourselves under
 * .data/reports/<id>/ rather than trusting a link back to wherever n8n put
 * it, so GET /api/audits/[id]/report never needs n8n's storage credentials.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidAuditId(id)) {
    return NextResponse.json({ error: "Invalid audit id." }, { status: 400 });
  }

  const n8nConfig = getN8nConfig();
  const providedSecret = request.headers.get("x-callback-secret");
  if (!n8nConfig || providedSecret !== n8nConfig.callbackSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const existing = await getAudit(id);
  if (!existing) {
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data." },
      { status: 400 },
    );
  }

  const status = formData.get("status");
  const message = formData.get("message");
  const reportFile = formData.get("report");

  if (
    typeof status !== "string" ||
    !TERMINAL_STATUSES.includes(status as AuditStatus)
  ) {
    return NextResponse.json(
      { error: `status must be one of: ${TERMINAL_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  let report: { fileName: string; sizeBytes: number } | undefined;

  if (status === "completed") {
    if (!(reportFile instanceof File)) {
      return NextResponse.json(
        { error: "status=completed requires a 'report' file field." },
        { status: 400 },
      );
    }
    const fileName = sanitizeFileName(reportFile.name);
    const auditDir = path.join(/* turbopackIgnore: true */ getReportsDir(), id);
    await mkdir(auditDir, { recursive: true });
    const bytes = Buffer.from(await reportFile.arrayBuffer());
    await writeFile(path.join(/* turbopackIgnore: true */ auditDir, fileName), bytes);
    report = { fileName, sizeBytes: bytes.byteLength };
  }

  const updated = await updateAudit(id, {
    status: status as AuditStatus,
    message: typeof message === "string" ? message : undefined,
    report,
  });

  return NextResponse.json({ ok: true, audit: updated });
}
