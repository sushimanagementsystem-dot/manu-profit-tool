import { Decimal } from '../common/decimal';
import type { BaseUnit } from '../generated/prisma/enums';

type UnitDefinition = { base: BaseUnit; factor: Decimal };

/** Generic conversions to the base units g / ml / each. Ingredient-specific ones ("1 bunch") are not guessed. */
const UNITS: Record<string, UnitDefinition> = {
  g: { base: 'G', factor: new Decimal(1) },
  gr: { base: 'G', factor: new Decimal(1) },
  gram: { base: 'G', factor: new Decimal(1) },
  grams: { base: 'G', factor: new Decimal(1) },
  kg: { base: 'G', factor: new Decimal(1000) },
  kilo: { base: 'G', factor: new Decimal(1000) },
  kgs: { base: 'G', factor: new Decimal(1000) },
  lb: { base: 'G', factor: new Decimal('453.59237') },
  lbs: { base: 'G', factor: new Decimal('453.59237') },
  oz: { base: 'G', factor: new Decimal('28.349523125') },
  ml: { base: 'ML', factor: new Decimal(1) },
  cl: { base: 'ML', factor: new Decimal(10) },
  dl: { base: 'ML', factor: new Decimal(100) },
  l: { base: 'ML', factor: new Decimal(1000) },
  ltr: { base: 'ML', factor: new Decimal(1000) },
  litre: { base: 'ML', factor: new Decimal(1000) },
  liter: { base: 'ML', factor: new Decimal(1000) },
  each: { base: 'EACH', factor: new Decimal(1) },
  ea: { base: 'EACH', factor: new Decimal(1) },
  pc: { base: 'EACH', factor: new Decimal(1) },
  pcs: { base: 'EACH', factor: new Decimal(1) },
  piece: { base: 'EACH', factor: new Decimal(1) },
  pieces: { base: 'EACH', factor: new Decimal(1) },
  unit: { base: 'EACH', factor: new Decimal(1) },
  portion: { base: 'EACH', factor: new Decimal(1) },
  slice: { base: 'EACH', factor: new Decimal(1) },
  dozen: { base: 'EACH', factor: new Decimal(12) },
  doz: { base: 'EACH', factor: new Decimal(12) },
};

export function lookupUnit(unit: string | null | undefined): UnitDefinition | null {
  if (!unit) return null;
  return UNITS[unit.trim().toLowerCase().replace(/\.$/, '')] ?? null;
}

/** Converts a recipe quantity to the ingredient's base unit; null when the units are incompatible. */
export function toBaseQuantity(quantity: Decimal, unit: string, base: BaseUnit): Decimal | null {
  const definition = lookupUnit(unit);
  if (!definition || definition.base !== base) return null;
  return quantity.times(definition.factor);
}

export type PackInfo = { packCount: Decimal; packSize: Decimal; packUnit: string };

const PACK_PATTERN =
  /(?:(\d+(?:[.,]\d+)?)\s*[x×*]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo|g|gr|grams?|lbs?|oz|ml|cl|dl|l|ltr|litre|liter)\b/i;

const toDecimal = (text: string) => new Decimal(text.replace(',', '.'));

/** Finds "6x2.5kg", "12 x 1L", "500g" in a product description. */
export function parsePackFromText(text: string): PackInfo | null {
  const match = PACK_PATTERN.exec(text);
  if (match) {
    return {
      packCount: match[1] ? toDecimal(match[1]) : new Decimal(1),
      packSize: toDecimal(match[2]),
      packUnit: match[3].toLowerCase(),
    };
  }
  const dozen = /\b(\d+)?\s*dozen\b/i.exec(text);
  if (dozen) {
    return { packCount: new Decimal(dozen[1] ?? 1), packSize: new Decimal(1), packUnit: 'dozen' };
  }
  return null;
}

export type BaseQuantityResult = {
  baseUnit: BaseUnit;
  /** Base units contained in ONE invoiced quantity (e.g. one case). */
  perInvoicedUnit: Decimal;
  /** True when no size could be found and each invoiced unit is counted as one item. */
  assumed: boolean;
};

/**
 * Works out how many grams / millilitres / items one invoiced unit contains, from explicit
 * pack fields first and the description second. Without any size information each invoiced
 * unit counts as one item, flagged as an assumption.
 */
export function resolveBaseQuantity(line: {
  description: string;
  packCount: Decimal | null;
  packSize: Decimal | null;
  packUnit: string | null;
}): BaseQuantityResult {
  const explicitUnit = lookupUnit(line.packUnit);
  if (explicitUnit && (line.packSize || line.packCount)) {
    const perUnit = (line.packCount ?? new Decimal(1))
      .times(line.packSize ?? new Decimal(1))
      .times(explicitUnit.factor);
    return { baseUnit: explicitUnit.base, perInvoicedUnit: perUnit, assumed: false };
  }

  const pack = parsePackFromText(`${line.packUnit ?? ''} ${line.description}`);
  const packUnit = pack ? lookupUnit(pack.packUnit) : null;
  if (pack && packUnit) {
    return {
      baseUnit: packUnit.base,
      perInvoicedUnit: pack.packCount.times(pack.packSize).times(packUnit.factor),
      assumed: false,
    };
  }

  if (explicitUnit) {
    // e.g. quantity 3 with unit "kg": each invoiced unit is one kg.
    return { baseUnit: explicitUnit.base, perInvoicedUnit: explicitUnit.factor, assumed: false };
  }
  return { baseUnit: 'EACH', perInvoicedUnit: new Decimal(1), assumed: true };
}
