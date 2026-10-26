import ExcelJS from 'exceljs';

import type { SnapshotPayload } from '../costing/snapshot.serializer';
import type { RevisionView } from '../revisions/revisions.service';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F2937' },
};

const CONFIDENCE_LABELS: Record<string, string> = {
  VERIFIED: 'Verified',
  PARTIALLY_VERIFIED: 'Partly verified',
  ESTIMATED: 'Estimated',
  INCOMPLETE: 'Missing data',
};

type Column = { header: string; key: string; width: number; numFmt?: string };

/**
 * Builds the client's Excel workbook from one result snapshot. Costing columns are real
 * formulas over the Recipe Lines and Ingredient Costs sheets, so the file stays usable:
 * changing a quantity or price recalculates in Excel exactly as the engine would.
 */
export async function buildWorkbook(
  payload: SnapshotPayload,
  revisions: RevisionView[],
  generatedAt: Date,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Menu Profit';
  workbook.created = generatedAt;
  const money = `#,##0.00`;

  addSummary(workbook, payload, generatedAt, money);
  addSales(workbook, payload, money);
  addCosting(workbook, payload, money);
  addRecipeLines(workbook, payload);
  addIngredients(workbook, payload);
  addInvoicePrices(workbook, payload);
  addRecommendations(workbook, payload, money);
  addNeedsReview(workbook, payload);
  addRevisionLog(workbook, revisions);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function addSheet(workbook: ExcelJS.Workbook, name: string, columns: Column[]): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({ header: column.header, key: column.key, width: column.width, style: column.numFmt ? { numFmt: column.numFmt } : undefined }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = HEADER_FILL;
  return sheet;
}

/** Excel needs real numbers, not the decimal strings the API serializes. */
const num = (value: string | null): number | null => (value === null ? null : Number(value));

function addSummary(workbook: ExcelJS.Workbook, payload: SnapshotPayload, generatedAt: Date, money: string): void {
  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [
    { key: 'label', width: 42 },
    { key: 'value', width: 22 },
  ];
  const title = sheet.addRow(['Menu Profit — profitability analysis']);
  title.font = { bold: true, size: 16 };
  sheet.addRow([]);

  const rows: [string, string | number | null][] = [
    ['Generated', generatedAt.toISOString().slice(0, 16).replace('T', ' ')],
    ['Revision', payload.revision],
    ['Currency', payload.currency],
    ['', ''],
    ['Net revenue', num(payload.summary.netRevenue)],
    ['Units sold', num(payload.summary.unitsSold)],
    ['Gross profit (where costs are known)', num(payload.summary.realisedGp)],
    ['Gross profit %', num(payload.summary.gpPercent)],
    ['Theoretical gross profit', num(payload.summary.theoreticalGp)],
    ['', ''],
    ['Menu items', payload.summary.itemsTotal],
    ['Menu items with a complete cost', payload.summary.itemsCosted],
    ['Share of revenue with complete costing (%)', num(payload.summary.revenueCoveredPercent)],
  ];
  for (const [label, value] of rows) {
    const row = sheet.addRow({ label, value });
    row.getCell('label').font = { bold: label !== '' && typeof value !== 'string' };
    if (typeof value === 'number') row.getCell('value').numFmt = money;
  }

  sheet.addRow([]);
  const note = sheet.addRow(['Figures marked "Estimated" or "Missing data" elsewhere in this workbook are not verified. See the Needs Review sheet.']);
  note.font = { italic: true, size: 10 };
}

function addSales(workbook: ExcelJS.Workbook, payload: SnapshotPayload, money: string): void {
  const sheet = addSheet(workbook, 'Sales Analysis', [
    { header: 'Menu item', key: 'name', width: 34 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Units sold', key: 'units', width: 12, numFmt: '#,##0' },
    { header: 'Net revenue', key: 'revenue', width: 14, numFmt: money },
    { header: 'Sales mix %', key: 'salesMix', width: 12, numFmt: '0.0' },
    { header: 'Revenue mix %', key: 'revenueMix', width: 14, numFmt: '0.0' },
    { header: 'GP contribution', key: 'gpContribution', width: 16, numFmt: money },
    { header: 'Class', key: 'matrixClass', width: 12 },
  ]);
  for (const item of payload.items) {
    sheet.addRow({
      name: item.name,
      category: item.category ?? '',
      units: num(item.unitsSold),
      revenue: num(item.netRevenue.value),
      salesMix: num(item.salesMixPercent),
      revenueMix: num(item.revenueMixPercent),
      gpContribution: num(item.theoreticalGp.value),
      matrixClass: item.matrixClass ?? '',
    });
  }

  const categories = addSheet(workbook, 'Category Performance', [
    { header: 'Category', key: 'category', width: 24 },
    { header: 'Items', key: 'items', width: 10, numFmt: '#,##0' },
    { header: 'Units sold', key: 'units', width: 12, numFmt: '#,##0' },
    { header: 'Net revenue', key: 'revenue', width: 14, numFmt: money },
    { header: 'Gross profit', key: 'gp', width: 14, numFmt: money },
    { header: 'GP %', key: 'gpPercent', width: 10, numFmt: '0.0' },
  ]);
  for (const category of payload.categories) {
    categories.addRow({
      category: category.category,
      items: category.items,
      units: num(category.unitsSold),
      revenue: num(category.netRevenue),
      gp: num(category.theoreticalGp),
      gpPercent: num(category.gpPercent),
    });
  }
}

/**
 * Menu Costing: cost per portion is a SUMIF over Recipe Lines, and GP/GP% follow from it,
 * so the client can edit a recipe or a price and see the figures update.
 */
function addCosting(workbook: ExcelJS.Workbook, payload: SnapshotPayload, money: string): void {
  const sheet = addSheet(workbook, 'Menu Costing', [
    { header: 'Menu item', key: 'name', width: 34 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Gross price', key: 'grossPrice', width: 13, numFmt: money },
    { header: 'VAT rate', key: 'vatRate', width: 10, numFmt: '0.0%' },
    { header: 'Net price', key: 'netPrice', width: 12, numFmt: money },
    { header: 'Cost per portion', key: 'cost', width: 16, numFmt: money },
    { header: 'GP per portion', key: 'gp', width: 15, numFmt: money },
    { header: 'GP %', key: 'gpPercent', width: 10, numFmt: '0.0' },
    { header: 'Units sold', key: 'units', width: 12, numFmt: '#,##0' },
    { header: 'GP contribution', key: 'gpContribution', width: 16, numFmt: money },
    { header: 'Data quality', key: 'confidence', width: 16 },
    { header: 'Notes', key: 'reasons', width: 60 },
  ]);

  payload.items.forEach((item, index) => {
    const excelRow = index + 2;
    const costed = item.costPerPortion.value !== null;
    sheet.addRow({
      name: item.name,
      category: item.category ?? '',
      grossPrice: num(item.grossPrice),
      vatRate: num(item.vatRate),
      netPrice: num(item.netPrice.value),
      cost: costed ? { formula: `SUMIF('Recipe Lines'!A:A,A${excelRow},'Recipe Lines'!H:H)` } : null,
      gp: costed ? { formula: `IF(OR(E${excelRow}="",F${excelRow}=""),"",E${excelRow}-F${excelRow})` } : null,
      gpPercent: costed ? { formula: `IF(OR(G${excelRow}="",E${excelRow}=0,E${excelRow}=""),"",G${excelRow}/E${excelRow}*100)` } : null,
      units: num(item.unitsSold),
      gpContribution: costed ? { formula: `IF(G${excelRow}="","",G${excelRow}*I${excelRow})` } : null,
      confidence: CONFIDENCE_LABELS[item.confidence] ?? item.confidence,
      reasons: item.reasons.join('; '),
    });
  });
}

/** One row per ingredient in a recipe; its cost is quantity × the price on Ingredient Costs. */
function addRecipeLines(workbook: ExcelJS.Workbook, payload: SnapshotPayload): void {
  const sheet = addSheet(workbook, 'Recipe Lines', [
    { header: 'Menu item', key: 'menuItem', width: 34 },
    { header: 'Ingredient', key: 'ingredient', width: 30 },
    { header: 'Quantity', key: 'quantity', width: 12, numFmt: '#,##0.####' },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Base quantity', key: 'baseQuantity', width: 14, numFmt: '#,##0.####' },
    { header: 'Base unit', key: 'baseUnit', width: 11 },
    { header: 'Cost per base unit', key: 'unitCost', width: 18, numFmt: '#,##0.00000000' },
    { header: 'Line cost', key: 'lineCost', width: 13, numFmt: '#,##0.0000' },
    { header: 'Source', key: 'source', width: 14 },
  ]);

  let excelRow = 2;
  for (const item of payload.items) {
    for (const line of item.recipe ?? []) {
      sheet.addRow({
        menuItem: item.name,
        ingredient: line.ingredientName,
        quantity: Number(line.quantity),
        unit: line.unit,
        baseQuantity: Number(line.baseQuantity),
        baseUnit: line.baseUnit,
        unitCost: { formula: `IFERROR(VLOOKUP(B${excelRow},'Ingredient Costs'!A:D,4,FALSE),"")` },
        lineCost: { formula: `IF(G${excelRow}="","",E${excelRow}*G${excelRow})` },
        source: line.source === 'AI_ESTIMATE' ? 'AI estimate' : 'Entered by you',
      });
      excelRow++;
    }
  }
  if (excelRow === 2) {
    sheet.addRow({ menuItem: 'No recipes have been entered yet.' }).font = { italic: true };
  }
}

function addIngredients(workbook: ExcelJS.Workbook, payload: SnapshotPayload): void {
  const sheet = addSheet(workbook, 'Ingredient Costs', [
    { header: 'Ingredient', key: 'name', width: 34 },
    { header: 'Base unit', key: 'baseUnit', width: 11 },
    { header: 'Used in items', key: 'usedIn', width: 14, numFmt: '#,##0' },
    { header: 'Cost per base unit', key: 'unitCost', width: 18, numFmt: '#,##0.00000000' },
    { header: 'Data quality', key: 'confidence', width: 16 },
    { header: 'Notes', key: 'reasons', width: 50 },
  ]);
  for (const ingredient of payload.ingredients) {
    sheet.addRow({
      name: ingredient.name,
      baseUnit: ingredient.baseUnit,
      usedIn: ingredient.usedInItems,
      unitCost: num(ingredient.unitCost.value),
      confidence: CONFIDENCE_LABELS[ingredient.unitCost.confidence] ?? ingredient.unitCost.confidence,
      reasons: ingredient.unitCost.reasons.join('; '),
    });
  }
}

function addInvoicePrices(workbook: ExcelJS.Workbook, payload: SnapshotPayload): void {
  if (!payload.supplierPrices?.length) return;
  const sheet = addSheet(workbook, 'Supplier Prices', [
    { header: 'Supplier', key: 'supplier', width: 26 },
    { header: 'Invoice', key: 'invoice', width: 18 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Product', key: 'product', width: 36 },
    { header: 'Quantity', key: 'quantity', width: 11, numFmt: '#,##0.####' },
    { header: 'Pack', key: 'pack', width: 14 },
    { header: 'Line net', key: 'lineNet', width: 12, numFmt: '#,##0.00' },
    { header: 'Cost per base unit', key: 'costPerBaseUnit', width: 18, numFmt: '#,##0.00000000' },
    { header: 'Base unit', key: 'baseUnit', width: 11 },
    { header: 'Data quality', key: 'confidence', width: 16 },
  ]);
  for (const price of payload.supplierPrices) {
    sheet.addRow({
      supplier: price.supplier ?? '',
      invoice: price.invoiceNumber ?? '',
      date: price.invoiceDate ?? '',
      product: price.description,
      quantity: num(price.quantity),
      pack: price.pack ?? '',
      lineNet: num(price.lineNet),
      costPerBaseUnit: num(price.costPerBaseUnit),
      baseUnit: price.baseUnit ?? '',
      confidence: CONFIDENCE_LABELS[price.confidence] ?? price.confidence,
    });
  }
}

function addRecommendations(workbook: ExcelJS.Workbook, payload: SnapshotPayload, money: string): void {
  const sheet = addSheet(workbook, 'Recommendations', [
    { header: '#', key: 'priority', width: 5 },
    { header: 'Type', key: 'kind', width: 14 },
    { header: 'Recommendation', key: 'title', width: 46 },
    { header: 'Estimated GP impact', key: 'impact', width: 20, numFmt: money },
    { header: 'Detail', key: 'body', width: 90 },
  ]);
  for (const recommendation of payload.recommendations) {
    const row = sheet.addRow({
      priority: recommendation.priority,
      kind: recommendation.kind,
      title: recommendation.title,
      impact: num(recommendation.impactGp),
      body: recommendation.body,
    });
    row.getCell('body').alignment = { wrapText: true, vertical: 'top' };
  }
}

/** Everything the client needs to fix or confirm, so the workbook is honest about its gaps. */
function addNeedsReview(workbook: ExcelJS.Workbook, payload: SnapshotPayload): void {
  const sheet = addSheet(workbook, 'Needs Review', [
    { header: 'Severity', key: 'severity', width: 12 },
    { header: 'What needs attention', key: 'text', width: 110 },
  ]);
  const order = { critical: 0, warning: 1, info: 2 };
  const issues = [...payload.issues].sort((a, b) => order[a.severity] - order[b.severity]);
  for (const issue of issues) {
    sheet.addRow({ severity: issue.severity, text: issue.text });
  }
  for (const match of payload.pendingMatches) {
    sheet.addRow({
      severity: 'warning',
      text: `POS item "${match.posName}" is not linked to a menu item${match.suggestedMenuItemName ? ` (suggested: ${match.suggestedMenuItemName})` : ''}.`,
    });
  }
  if (!issues.length && !payload.pendingMatches.length) {
    sheet.addRow({ severity: 'info', text: 'No data-quality issues were found.' });
  }
}

function addRevisionLog(workbook: ExcelJS.Workbook, revisions: RevisionView[]): void {
  const applied = revisions.filter((revision) => revision.number !== null);
  if (!applied.length) return;
  const sheet = addSheet(workbook, 'Revision Log', [
    { header: 'Revision', key: 'number', width: 10 },
    { header: 'When', key: 'when', width: 20 },
    { header: 'Requested', key: 'rationale', width: 50 },
    { header: 'Changes applied', key: 'changes', width: 90 },
  ]);
  for (const revision of [...applied].reverse()) {
    const row = sheet.addRow({
      number: revision.number,
      when: (revision.decidedAt ?? revision.createdAt).toISOString().slice(0, 16).replace('T', ' '),
      rationale: revision.rationale ?? '',
      changes: revision.changes.join('; '),
    });
    row.getCell('changes').alignment = { wrapText: true, vertical: 'top' };
  }
}
