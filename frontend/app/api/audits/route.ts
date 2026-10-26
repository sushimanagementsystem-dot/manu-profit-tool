import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getN8nConfig } from "@/lib/audit/env";
import { createAudit, updateAudit } from "@/lib/audit/store";
import type { AuditSlotKey } from "@/lib/audit/types";
import { validateSlotFiles } from "@/lib/audit/validate-upload";

const SLOT_KEYS: AuditSlotKey[] = ["menu", "invoices", "pos"];
const FORWARD_TIMEOUT_MS = 15_000;

/**
 * Accepts the three upload slots as multipart/form-data, validates them,
 * creates an audit record, and forwards the files to n8n. The n8n access
 * token and webhook URL never reach the browser — this route is the only
 * thing that knows them (read from env, see lib/audit/env.ts).
 *
 * Always responds 202 with just { auditId } once validation passes, even
 * if forwarding to n8n fails — the failure is recorded on the audit and
 * surfaces through GET /api/audits/[id]/status instead, so the client
 * never has to treat "the HTTP request succeeded" as "the audit is done".
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data." },
      { status: 400 },
    );
  }

  const filesBySlot: Record<AuditSlotKey, File[]> = {
    menu: [],
    invoices: [],
    pos: [],
  };

  for (const key of SLOT_KEYS) {
    filesBySlot[key] = formData
      .getAll(key)
      .filter((entry): entry is File => entry instanceof File);
  }

  for (const key of SLOT_KEYS) {
    const result = validateSlotFiles(key, filesBySlot[key]);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }

  const auditId = randomUUID();
  await createAudit(auditId);

  const n8nConfig = getN8nConfig();
  if (!n8nConfig) {
    await updateAudit(auditId, {
      status: "failed",
      message:
        "n8n integration isn't configured (N8N_WEBHOOK_URL / N8N_WEBHOOK_SECRET / N8N_CALLBACK_SECRET missing — see .env.example).",
    });
    return NextResponse.json({ auditId }, { status: 202 });
  }

  const forwardForm = new FormData();
  forwardForm.set("auditId", auditId);
  for (const key of SLOT_KEYS) {
    for (const file of filesBySlot[key]) {
      forwardForm.append(key, file, file.name);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);

  try {
    const response = await fetch(n8nConfig.webhookUrl, {
      method: "POST",
      headers: { "x-webhook-secret": n8nConfig.webhookSecret },
      body: forwardForm,
      signal: controller.signal,
    });

    if (!response.ok) {
      await updateAudit(auditId, {
        status: "failed",
        message: `n8n rejected the audit request (HTTP ${response.status}).`,
      });
      return NextResponse.json({ auditId }, { status: 202 });
    }

    await updateAudit(auditId, { status: "processing" });
    return NextResponse.json({ auditId }, { status: 202 });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    await updateAudit(auditId, {
      status: "failed",
      message: timedOut
        ? "Timed out contacting n8n."
        : "Could not reach n8n to start processing.",
    });
    return NextResponse.json({ auditId }, { status: 202 });
  } finally {
    clearTimeout(timeout);
  }
}
