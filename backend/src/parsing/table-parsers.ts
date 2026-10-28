import type {
  InvoiceExtraction,
  MenuExtraction,
  PosExtraction,
} from '../extraction/extraction.schemas';
import { describeHeaderRow, detectColumns, type ColumnMap, type FieldSynonyms } from './column-detect';
import {
  cellText,
  detectDecimalSeparator,
  isTotalRow,
  parseAmount,
  parseDate,
  type Cell,
  type DecimalSeparator,
} from './values';

/** Thrown when a spreadsheet has no recognisable header; the message is shown to the client. */
export class TableFormatError extends Error {}

/** What a client is asked for when a required column is missing; the field names are internal. */
const FIELD_LABELS: Record<string, string> = {
  name: 'item name',
  price: 'selling price',
  itemName: 'item name',
  quantity: 'quantity sold',
  description: 'product description',
  lineNet: 'line total (net amount)',
};

// Matching is on whole words of the header ("Item Qty" matches "qty"), so a synonym only needs
// adding when it brings a word the lists below do not already contain. Avoid bare codes such as
// "plu", "sku" or "code": those columns hold ids, and mapping one as a name would read garbage.
const MENU_COLUMNS: FieldSynonyms<'name' | 'price' | 'category' | 'description'> = {
  name: ['menu item', 'item name', 'dish', 'item', 'name', 'product', 'article', 'title', 'menu entry'],
  price: ['selling price', 'sell price', 'menu price', 'sales price', 'price', 'rrp', 'prijs', 'preis'],
  category: ['category', 'section', 'group', 'course', 'department'],
  description: ['description', 'details', 'desc'],
};

const POS_COLUMNS: FieldSynonyms<
  'itemName' | 'quantity' | 'netRevenue' | 'grossRevenue' | 'category' | 'date'
> = {
  itemName: ['item name', 'menu item', 'product name', 'plu name', 'item', 'product', 'name', 'article', 'dish', 'title', 'description'],
  quantity: ['qty sold', 'quantity sold', 'items sold', 'units sold', 'quantity', 'qty', 'units', 'sold', 'count', 'number', 'pcs', 'portions'],
  netRevenue: [
    'net sales', 'net revenue', 'sales ex vat', 'revenue ex vat', 'net amount', 'ex vat', 'excl vat',
    'exc vat', 'ex tax', 'excl tax', 'exc tax', 'before vat', 'before tax', 'pre vat', 'pre tax', 'without vat', 'net',
  ],
  grossRevenue: [
    'gross sales', 'total sales', 'sales inc vat', 'revenue inc vat', 'incl vat', 'inc vat', 'incl tax',
    'inc tax', 'with vat', 'takings', 'turnover', 'gross', 'sales', 'revenue', 'total', 'amount', 'value',
  ],
  category: ['category', 'group', 'department', 'family', 'section', 'major group', 'revenue group', 'report group'],
  date: ['business date', 'date', 'day', 'period'],
};

const INVOICE_COLUMNS: FieldSynonyms<
  | 'description'
  | 'quantity'
  | 'packSize'
  | 'unitPrice'
  | 'lineNet'
  | 'vatRate'
  | 'supplier'
  | 'invoiceNumber'
  | 'invoiceDate'
> = {
  description: ['product description', 'item description', 'description', 'product', 'item', 'article', 'goods', 'name'],
  quantity: ['quantity', 'qty', 'units', 'cases', 'ordered', 'delivered', 'pcs'],
  // unitPrice must come before packSize: fields are assigned in this order, and without it a bare
  // "Unit Price" header (no pack column in the file) is taken by packSize through its word "unit".
  unitPrice: ['unit price', 'unit cost', 'price per unit', 'cost price', 'price', 'rate', 'cost'],
  packSize: ['pack size', 'pack', 'size', 'unit size', 'uom', 'unit'],
  lineNet: ['net amount', 'line total', 'line net', 'line value', 'net total', 'ex vat', 'excl vat', 'subtotal', 'net', 'amount', 'total', 'value'],
  vatRate: ['vat rate', 'vat %', 'tax rate', 'vat'],
  supplier: ['supplier', 'vendor', 'seller', 'company'],
  invoiceNumber: ['invoice number', 'invoice no', 'inv no', 'inv number', 'document number', 'document no', 'doc no', 'invoice', 'reference'],
  invoiceDate: ['invoice date', 'inv date', 'document date', 'tax point', 'date'],
};

type Table<F extends string> = {
  dataRows: { row: Cell[]; ref: string }[];
  columns: ColumnMap<F>;
  separator: DecimalSeparator;
};

function prepare<F extends string>(
  rows: Cell[][],
  synonyms: FieldSynonyms<F>,
  required: NoInfer<F>[],
  label: string,
): Table<F> {
  const detection = detectColumns(rows, synonyms, required);
  if (!detection) {
    const needed = required.map((field) => FIELD_LABELS[field] ?? field).join(' and ');
    const seen = describeHeaderRow(rows);
    throw new TableFormatError(
      `Could not find the ${label} columns: we need ${needed}. ` +
        (seen.length
          ? `The columns in your file look like: ${seen.map((header) => `"${header}"`).join(', ')}. ` +
            'Please rename them, or re-export the report with those columns.'
          : 'The file has no header row; please add one as the first row.'),
    );
  }
  const dataRows = rows
    .slice(detection.headerRow + 1)
    .map((row, index) => ({ row, ref: `row ${detection.headerRow + index + 2}` }));
  const separator = detectDecimalSeparator(dataRows.flatMap(({ row }) => row));
  return { dataRows, columns: detection.columns, separator };
}

const read = <F extends string>(row: Cell[], columns: ColumnMap<F>, field: F): Cell =>
  columns[field] === undefined ? null : (row[columns[field]] ?? null);

/** Normalised decimal string (dot separator), or null. */
const amountText = (value: Cell, separator: DecimalSeparator) =>
  parseAmount(value, separator)?.toString() ?? null;

const optionalText = (value: Cell) => cellText(value) || null;

export function parseMenuTable(rows: Cell[][]): MenuExtraction {
  const { dataRows, columns, separator } = prepare(rows, MENU_COLUMNS, ['name', 'price'], 'menu');
  const items: MenuExtraction['items'] = [];
  for (const { row, ref } of dataRows) {
    const name = cellText(read(row, columns, 'name'));
    if (!name || isTotalRow(name)) continue;
    items.push({
      name,
      price: amountText(read(row, columns, 'price'), separator),
      category: optionalText(read(row, columns, 'category')),
      description: optionalText(read(row, columns, 'description')),
      sourceRef: ref,
    });
  }
  return { items, warnings: items.length ? [] : ['No menu items found in this file.'] };
}

export function parsePosTable(rows: Cell[][]): PosExtraction {
  const { dataRows, columns, separator } = prepare(rows, POS_COLUMNS, ['itemName', 'quantity'], 'POS sales');
  const result: PosExtraction = { periodStart: null, periodEnd: null, rows: [], warnings: [] };
  const dates: Date[] = [];

  for (const { row, ref } of dataRows) {
    const itemName = cellText(read(row, columns, 'itemName'));
    if (!itemName || isTotalRow(itemName)) continue;
    const date = parseDate(read(row, columns, 'date'));
    if (date) dates.push(date);
    result.rows.push({
      itemName,
      category: optionalText(read(row, columns, 'category')),
      quantity: amountText(read(row, columns, 'quantity'), separator),
      netRevenue: amountText(read(row, columns, 'netRevenue'), separator),
      grossRevenue: amountText(read(row, columns, 'grossRevenue'), separator),
      date: date ? date.toISOString().slice(0, 10) : null,
      sourceRef: ref,
    });
  }

  if (dates.length) {
    const sorted = dates.map((date) => date.getTime()).sort((a, b) => a - b);
    result.periodStart = new Date(sorted[0]).toISOString().slice(0, 10);
    result.periodEnd = new Date(sorted[sorted.length - 1]).toISOString().slice(0, 10);
  }
  if (columns.netRevenue === undefined && columns.grossRevenue === undefined) {
    result.warnings.push('No revenue column found; revenue will be estimated from menu prices.');
  }
  if (!result.rows.length) result.warnings.push('No sales rows found in this file.');
  return result;
}

/** A spreadsheet invoice export: lines grouped into invoices by the invoice-number column when present. */
export function parseInvoiceTable(rows: Cell[][]): InvoiceExtraction {
  const { dataRows, columns, separator } = prepare(
    rows,
    INVOICE_COLUMNS,
    ['description', 'lineNet'],
    'invoice',
  );
  const invoices = new Map<string, InvoiceExtraction['invoices'][number]>();

  for (const { row, ref } of dataRows) {
    const description = cellText(read(row, columns, 'description'));
    if (!description || isTotalRow(description)) continue;
    const invoiceNumber = optionalText(read(row, columns, 'invoiceNumber'));
    const key = invoiceNumber ?? '(single)';
    if (!invoices.has(key)) {
      const date = parseDate(read(row, columns, 'invoiceDate'));
      invoices.set(key, {
        supplierName: optionalText(read(row, columns, 'supplier')),
        invoiceNumber,
        invoiceDate: date ? date.toISOString().slice(0, 10) : null,
        currency: null,
        totals: { net: null, vat: null, gross: null },
        lines: [],
      });
    }
    invoices.get(key)!.lines.push({
      description,
      quantity: amountText(read(row, columns, 'quantity'), separator),
      packCount: null,
      packSize: null,
      packUnit: optionalText(read(row, columns, 'packSize')),
      unitPrice: amountText(read(row, columns, 'unitPrice'), separator),
      lineNet: amountText(read(row, columns, 'lineNet'), separator),
      vatRate: amountText(read(row, columns, 'vatRate'), separator),
      sourceRef: ref,
      modelConfidence: null,
    });
  }
  return {
    invoices: [...invoices.values()],
    warnings: invoices.size ? [] : ['No invoice lines found in this file.'],
  };
}
