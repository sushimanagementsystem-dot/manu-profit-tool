import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

import type { Cell } from './values';

const MAX_ROWS = 50_000;

/** Reads the most data-rich sheet of an XLSX file, or a CSV file, into a grid of cells. */
export async function readTable(buffer: Buffer, type: 'xlsx' | 'csv'): Promise<Cell[][]> {
  const rows = type === 'csv' ? readCsv(buffer) : await readXlsx(buffer);
  return rows.slice(0, MAX_ROWS).filter((row) => row.some((cell) => cell !== null && cell !== ''));
}

function readCsv(buffer: Buffer): Cell[][] {
  const text = decodeText(buffer);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', '\t', ',', '|'].reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best,
  );
  const records = parse(text, {
    delimiter,
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    to: MAX_ROWS,
  }) as string[][];
  return records.map((record) => record.map((value) => (value === '' ? null : value)));
}

/** POS exports are often Windows-1252 rather than UTF-8. */
function decodeText(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

async function readXlsx(buffer: Buffer): Promise<Cell[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  let best: Cell[][] = [];
  workbook.eachSheet((sheet) => {
    const rows: Cell[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as ExcelJS.CellValue[];
      rows.push(values.slice(1).map(toCell));
    });
    if (rows.length > best.length) best = rows;
  });
  return best;
}

function toCell(value: ExcelJS.CellValue | undefined): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) return value;
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if ('result' in value) return toCell(value.result as ExcelJS.CellValue);
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('text' in value) return String(value.text);
    if ('error' in value) return null;
  }
  return null;
}
