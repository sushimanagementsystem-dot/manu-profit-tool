import { cellText, type Cell } from './values';

/**
 * Header synonyms per field, most specific first. Matching is on a normalized header
 * (lowercase, letters/digits only), exact match scoring higher than "contains".
 */
export type FieldSynonyms<F extends string> = Record<F, string[]>;

export type ColumnMap<F extends string> = Partial<Record<F, number>>;

export type HeaderDetection<F extends string> = { headerRow: number; columns: ColumnMap<F> };

const normalizeHeader = (value: Cell) =>
  cellText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Finds the header row within the first rows of a sheet and maps fields to column indexes.
 * Fields are assigned in declaration order, so list the more specific field first
 * (e.g. `netRevenue` before `grossRevenue`, since "net sales" also contains "sales").
 */
export function detectColumns<F extends string>(
  rows: Cell[][],
  synonyms: FieldSynonyms<F>,
  required: NoInfer<F>[],
): HeaderDetection<F> | null {
  let best: { detection: HeaderDetection<F>; score: number } | null = null;

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex++) {
    const headers = rows[rowIndex].map(normalizeHeader);
    const { columns, score } = assignColumns(headers, synonyms);
    const hasRequired = required.every((field) => columns[field] !== undefined);
    if (hasRequired && (!best || score > best.score)) {
      best = { detection: { headerRow: rowIndex, columns }, score };
    }
  }
  return best?.detection ?? null;
}

function assignColumns<F extends string>(headers: string[], synonyms: FieldSynonyms<F>) {
  const columns: ColumnMap<F> = {};
  const used = new Set<number>();
  let score = 0;

  for (const field of Object.keys(synonyms) as F[]) {
    let bestColumn = -1;
    let bestScore = 0;
    headers.forEach((header, column) => {
      if (!header || used.has(column)) return;
      for (const synonym of synonyms[field]) {
        const value = header === synonym ? 3 : wordContains(header, synonym) ? 1 : 0;
        if (value > bestScore) {
          bestScore = value;
          bestColumn = column;
        }
      }
    });
    if (bestColumn >= 0) {
      columns[field] = bestColumn;
      used.add(bestColumn);
      score += bestScore;
    }
  }
  return { columns, score };
}

function wordContains(header: string, synonym: string): boolean {
  return ` ${header} `.includes(` ${synonym} `);
}
