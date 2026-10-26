import type { FileCategory } from '../generated/prisma/enums';

export type SniffedType = 'pdf' | 'png' | 'jpeg' | 'xlsx' | 'csv';

export const MIME_BY_TYPE: Record<SniffedType, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};

/** Types that are parsed deterministically; everything else needs AI extraction (n8n). */
export const SPREADSHEET_TYPES: SniffedType[] = ['xlsx', 'csv'];

export const UPLOAD_LIMITS = {
  maxFileBytes: 15 * 1024 * 1024,
  maxTotalBytes: 150 * 1024 * 1024,
  maxPdfPages: 20,
  maxXlsxUncompressedBytes: 50 * 1024 * 1024,
  categories: {
    MENU: { maxFiles: 5, types: ['pdf', 'png', 'jpeg', 'xlsx', 'csv'] },
    INVOICE: { maxFiles: 40, types: ['pdf', 'png', 'jpeg', 'xlsx', 'csv'] },
    POS: { maxFiles: 5, types: ['xlsx', 'csv'] },
  } satisfies Record<FileCategory, { maxFiles: number; types: SniffedType[] }>,
};

/** Public shape returned to the frontend so its pre-checks use the same numbers. */
export function publicUploadLimits() {
  const categories = Object.fromEntries(
    Object.entries(UPLOAD_LIMITS.categories).map(([category, rule]) => [
      category,
      { maxFiles: rule.maxFiles, accept: rule.types.map((type) => MIME_BY_TYPE[type]) },
    ]),
  );
  return {
    maxFileBytes: UPLOAD_LIMITS.maxFileBytes,
    maxTotalBytes: UPLOAD_LIMITS.maxTotalBytes,
    maxPdfPages: UPLOAD_LIMITS.maxPdfPages,
    categories,
  };
}
