import {
  MAX_FILE_SIZE_BYTES,
  SLOT_CONFIG,
  type AuditSlotKey,
} from "@/lib/audit/types";

export type ValidationResult = { ok: true } | { ok: false; error: string };

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function validateSlotFiles(
  key: AuditSlotKey,
  files: File[],
): ValidationResult {
  const config = SLOT_CONFIG[key];

  if (files.length === 0) {
    return { ok: false, error: `${config.label} is required.` };
  }

  if (!config.multiple && files.length > 1) {
    return {
      ok: false,
      error: `${config.label} only accepts a single file.`,
    };
  }

  for (const file of files) {
    if (!config.accept.includes(file.type)) {
      return {
        ok: false,
        error: `${config.label}: "${file.name}" has an unsupported file type (${file.type || "unknown"}).`,
      };
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        ok: false,
        error: `${config.label}: "${file.name}" is ${formatMB(file.size)}, which is over the ${formatMB(MAX_FILE_SIZE_BYTES)} limit.`,
      };
    }
    if (file.size === 0) {
      return {
        ok: false,
        error: `${config.label}: "${file.name}" is empty.`,
      };
    }
  }

  return { ok: true };
}
