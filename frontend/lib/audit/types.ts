export type AuditStatus =
  | "uploaded"
  | "processing"
  | "review_required"
  | "completed"
  | "failed";

export type AuditSlotKey = "menu" | "invoices" | "pos";

export type AuditRecord = {
  id: string;
  status: AuditStatus;
  createdAt: string;
  updatedAt: string;
  /** Human-readable reason, shown to the user when status is "failed" or "review_required". */
  message?: string;
  /** Set once n8n's callback reports a generated report is available. */
  report?: {
    fileName: string;
    sizeBytes: number;
  };
};

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB, matches the UI copy

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Audit IDs come from crypto.randomUUID() and end up in filesystem paths
 * (the JSON store key, the reports directory). Routes that accept an `id`
 * from the URL must check this before touching disk — see
 * app/api/audits/[id]/callback/route.ts and .../report/route.ts.
 */
export function isValidAuditId(id: string): boolean {
  return UUID_RE.test(id);
}

export const SLOT_CONFIG: Record<
  AuditSlotKey,
  { label: string; accept: string[]; multiple: boolean }
> = {
  menu: {
    label: "Current Menu",
    accept: [
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "image/jpeg",
      "image/png",
    ],
    multiple: false,
  },
  invoices: {
    label: "Supplier Invoices",
    accept: [
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/jpeg",
      "image/png",
    ],
    multiple: true,
  },
  pos: {
    label: "POS Sales Report",
    accept: [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ],
    multiple: false,
  },
};
