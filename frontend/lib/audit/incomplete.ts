import type { FileCategory, UploadedFile } from "@/lib/api/types";

import { SLOTS } from "./slots";

export type UnreadFile = {
  id: string;
  name: string;
  /** What the client uploaded it as, e.g. "POS Sales Report". */
  slot: string;
  /** Why it could not be read, in the backend's words. */
  reason: string;
  /** What is missing from the figures because of it. */
  effect: string;
};

const EFFECTS: Record<FileCategory, string> = {
  MENU: "Menu items and prices are missing, so sales cannot be matched to dishes.",
  INVOICE: "Supplier prices are missing, so costs and gross profit may be unknown.",
  POS: "Sales are missing, so revenue and items sold are empty or too low.",
};

/**
 * Files the backend could not read. A job still finishes with the rest, so the screen can show
 * a ready analysis whose numbers quietly lack a whole file; these are what to warn about.
 */
export function unreadFiles(files: UploadedFile[]): UnreadFile[] {
  return files
    .filter((file) => file.status === "FAILED")
    .map((file) => ({
      id: file.id,
      name: file.originalName,
      slot: SLOTS.find((slot) => slot.category === file.category)?.label ?? "File",
      reason: file.statusMessage ?? "This file could not be read.",
      effect: EFFECTS[file.category],
    }));
}
