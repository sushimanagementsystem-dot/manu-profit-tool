import type { FileCategory, UploadLimits } from "@/lib/api/types";

/** Upload slot presentation. The real limits come from the API's `limits` payload. */
export type SlotConfig = {
  category: FileCategory;
  step: number;
  label: string;
  description: string;
  requirements: string;
  color: { badge: string; icon: string; dropzone: string };
};

export const SLOTS: SlotConfig[] = [
  {
    category: "MENU",
    step: 1,
    label: "Current Menu",
    description: "Your menu with item names and prices",
    requirements: "Needs item names and selling prices. Add an older version too if prices changed during the period.",
    color: {
      badge: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
      icon: "bg-rose-100 text-rose-500 dark:bg-rose-500/15 dark:text-rose-300",
      dropzone:
        "border-rose-200 bg-rose-50/60 hover:bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/5 dark:hover:bg-rose-500/10",
    },
  },
  {
    category: "INVOICE",
    step: 2,
    label: "Supplier Invoices",
    description: "All invoices covering the sales period",
    requirements: "Needs product names, quantities, pack sizes and prices. More invoices means more accurate costs.",
    color: {
      badge: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
      icon: "bg-amber-100 text-amber-500 dark:bg-amber-500/15 dark:text-amber-300",
      dropzone:
        "border-amber-200 bg-amber-50/60 hover:bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/5 dark:hover:bg-amber-500/10",
    },
  },
  {
    category: "POS",
    step: 3,
    label: "POS Sales Report",
    description: "Sales by item from your till system",
    requirements: "Needs item names and quantities sold; revenue columns make the analysis more accurate.",
    color: {
      badge: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
      icon: "bg-blue-100 text-blue-500 dark:bg-blue-500/15 dark:text-blue-300",
      dropzone:
        "border-blue-200 bg-blue-50/60 hover:bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/5 dark:hover:bg-blue-500/10",
    },
  },
];

const EXTENSION_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "text/csv": "CSV",
};

/** "PDF, Excel, CSV, JPG, PNG · up to 5 files, 15 MB each" */
export function describeAccepted(
  category: FileCategory,
  limits: UploadLimits | null,
): string {
  if (!limits) return "Loading…";
  const rule = limits.categories[category];
  const types = [...new Set(rule.accept.map((mime) => EXTENSION_LABELS[mime] ?? mime))];
  const size = Math.round(limits.maxFileBytes / (1024 * 1024));
  return `${types.join(", ")} · up to ${rule.maxFiles} files, ${size} MB each`;
}

/** Client-side pre-check so an obviously wrong file never costs an upload round-trip. */
export function preCheckFile(
  category: FileCategory,
  file: File,
  limits: UploadLimits | null,
): string | null {
  if (!limits) return null;
  const rule = limits.categories[category];
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > limits.maxFileBytes) {
    return `"${file.name}" is larger than ${Math.round(limits.maxFileBytes / (1024 * 1024))} MB.`;
  }
  // The browser's type is a hint only — the server identifies files by their content.
  if (file.type && !rule.accept.includes(file.type)) {
    const label = EXTENSION_LABELS[file.type] ?? file.type;
    return `${label} files are not accepted here.`;
  }
  return null;
}
