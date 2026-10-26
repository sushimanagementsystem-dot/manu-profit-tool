import type { DocumentExtraction } from '../extraction/extraction.schemas';
import type { FileCategory } from '../generated/prisma/enums';
import { readTable } from './spreadsheet';
import { parseInvoiceTable, parseMenuTable, parsePosTable } from './table-parsers';

/** Deterministic extraction of a CSV/XLSX file into the shared document contract. */
export async function parseSpreadsheetDocument(
  buffer: Buffer,
  mimeType: string,
  category: FileCategory,
): Promise<DocumentExtraction> {
  const rows = await readTable(buffer, mimeType === 'text/csv' ? 'csv' : 'xlsx');
  switch (category) {
    case 'MENU':
      return { category, data: parseMenuTable(rows) };
    case 'POS':
      return { category, data: parsePosTable(rows) };
    case 'INVOICE':
      return { category, data: parseInvoiceTable(rows) };
  }
}
