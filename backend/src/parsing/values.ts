import { Decimal } from '../common/decimal';

export type Cell = string | number | Date | null;
export type DecimalSeparator = '.' | ',';

/**
 * Picks the decimal separator a file uses by looking at how its numeric strings end:
 * "12,50" votes for comma, "12.50" for dot. Defaults to dot.
 */
export function detectDecimalSeparator(values: Cell[]): DecimalSeparator {
  let comma = 0;
  let dot = 0;
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (/,\d{1,2}$/.test(text)) comma++;
    else if (/\.\d{1,2}$/.test(text)) dot++;
    else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(text)) comma++;
    else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(text)) dot++;
  }
  return comma > dot ? ',' : '.';
}

/** Parses "€1.234,56", "1,234.56", "(12.00)", "12" into a Decimal, or null when not a number. */
export function parseAmount(value: Cell, separator: DecimalSeparator = '.'): Decimal | null {
  if (value === null || value instanceof Date) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? new Decimal(value) : null;

  let text = value.trim();
  if (!text || text === '-') return null;
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text) || /-$/.test(text);
  text = text.replace(/[()\s€$£%]|EUR|GBP|USD/gi, '').replace(/^-|-$/g, '');

  if (separator === ',') text = text.replace(/\./g, '').replace(',', '.');
  else text = text.replace(/,/g, '');

  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const amount = new Decimal(text);
  return negative ? amount.negated() : amount;
}

/** Accepts Date cells, ISO dates, and day-first dates (dd/mm/yyyy, dd.mm.yy). */
export function parseDate(value: Cell): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;
  const text = value.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return utcDate(+iso[1], +iso[2], +iso[3]);

  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
  if (dayFirst) {
    const year = +dayFirst[3] < 100 ? 2000 + +dayFirst[3] : +dayFirst[3];
    return utcDate(year, +dayFirst[2], +dayFirst[1]);
  }
  return null;
}

function utcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

export function cellText(value: Cell): string {
  if (value === null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** Rows like "Total" / "Subtotal" / "Grand total" are summaries, not items. */
export function isTotalRow(label: string): boolean {
  return /^(grand\s*)?(sub\s*)?totals?\b|^summe|^gesamt|^totaal/i.test(label.trim());
}
