import { NextResponse } from "next/server";

import { getAudit } from "@/lib/audit/store";
import { isValidAuditId } from "@/lib/audit/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidAuditId(id)) {
    return NextResponse.json({ error: "Invalid audit id." }, { status: 400 });
  }

  const audit = await getAudit(id);
  if (!audit) {
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: audit.id,
    status: audit.status,
    message: audit.message,
    report: audit.report,
  });
}
