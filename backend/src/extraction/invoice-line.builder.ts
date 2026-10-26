import { Decimal } from '../common/decimal';
import type { BaseUnit, Confidence } from '../generated/prisma/enums';
import { normalizeName } from '../normalization/names';
import { resolveBaseQuantity } from '../normalization/units';
import { parseAmount } from '../parsing/values';
import type { InvoiceLineExtraction } from './extraction.schemas';

/** Tolerance for "quantity × unit price ≈ line total". */
const LINE_TOLERANCE = new Decimal('0.02');

export type BuiltInvoiceLine = {
  sourceRef: string | null;
  rawDescription: string;
  normalizedName: string;
  quantity: Decimal | null;
  packCount: Decimal | null;
  packSize: Decimal | null;
  packUnit: string | null;
  baseUnit: BaseUnit | null;
  baseQuantity: Decimal | null;
  unitPrice: Decimal | null;
  lineNet: Decimal | null;
  vatRate: Decimal | null;
  costPerBaseUnit: Decimal | null;
  confidence: Confidence;
  modelConfidence: string | null;
};

/**
 * Turns one extracted invoice line into stored values, computing the cost per base unit
 * (per g / ml / item) and a system confidence from cross-checks — the model's own
 * confidence only ever lowers it.
 */
export function buildInvoiceLine(line: InvoiceLineExtraction, fromAi: boolean): BuiltInvoiceLine {
  const quantity = parseAmount(line.quantity);
  const unitPrice = parseAmount(line.unitPrice);
  const packCount = parseAmount(line.packCount);
  const packSize = parseAmount(line.packSize);
  let lineNet = parseAmount(line.lineNet);

  let confidence: Confidence = fromAi ? 'PARTIALLY_VERIFIED' : 'VERIFIED';
  const lower = (level: Confidence) => {
    const order: Confidence[] = ['VERIFIED', 'PARTIALLY_VERIFIED', 'ESTIMATED', 'INCOMPLETE'];
    if (order.indexOf(level) > order.indexOf(confidence)) confidence = level;
  };

  if (!lineNet && quantity && unitPrice) lineNet = quantity.times(unitPrice);
  if (lineNet && quantity && unitPrice) {
    const expected = quantity.times(unitPrice);
    const tolerance = Decimal.max(expected.abs().times(LINE_TOLERANCE), new Decimal('0.02'));
    if (expected.minus(lineNet).abs().gt(tolerance)) lower('ESTIMATED');
  }
  if (line.modelConfidence === 'low') lower('ESTIMATED');

  const base = resolveBaseQuantity({
    description: line.description,
    packCount,
    packSize,
    packUnit: line.packUnit,
  });
  if (base.assumed) lower('ESTIMATED');

  const effectiveQuantity = quantity ?? (lineNet && unitPrice && !unitPrice.isZero() ? lineNet.dividedBy(unitPrice) : null);
  const baseQuantity = effectiveQuantity ? effectiveQuantity.times(base.perInvoicedUnit) : null;
  const costPerBaseUnit =
    lineNet && baseQuantity && baseQuantity.gt(0) && lineNet.gte(0) ? lineNet.dividedBy(baseQuantity) : null;
  if (!costPerBaseUnit) lower('INCOMPLETE');

  return {
    sourceRef: line.sourceRef,
    rawDescription: line.description,
    normalizedName: normalizeName(line.description),
    quantity,
    packCount,
    packSize,
    packUnit: line.packUnit,
    baseUnit: base.baseUnit,
    baseQuantity,
    unitPrice,
    lineNet,
    vatRate: normalizeVatRate(parseAmount(line.vatRate)),
    costPerBaseUnit,
    confidence,
    modelConfidence: line.modelConfidence,
  };
}

/** Accepts "13.5" (percent) or "0.135" (fraction) and stores a fraction. */
export function normalizeVatRate(value: Decimal | null): Decimal | null {
  if (!value || value.isNegative()) return null;
  return value.gt(1) ? value.dividedBy(100) : value;
}
