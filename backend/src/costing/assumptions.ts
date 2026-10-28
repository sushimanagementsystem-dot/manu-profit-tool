import { z } from 'zod';

import { Decimal } from '../common/decimal';
import type { EngineAssumptions, PriceBasis } from './engine';

/** Costing assumptions the client can change (via submit or chat). Stored per job in `Assumption`. */
export const ASSUMPTION_KEYS = [
  'VAT_RATE',
  'VAT_RATE_DRINK',
  'MENU_PRICES_INCLUDE_VAT',
  'PRICE_BASIS',
  'WASTAGE_PCT',
] as const;

export type AssumptionKey = (typeof ASSUMPTION_KEYS)[number];

const fraction = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .refine((value) => new Decimal(value).lte(1), 'must be a fraction between 0 and 1');

/** Validation for each key's value; VAT rates are fractions (0.135 = 13.5 %). */
export const ASSUMPTION_VALUE_SCHEMAS: Record<AssumptionKey, z.ZodType> = {
  VAT_RATE: fraction.refine((value) => new Decimal(value).lte('0.5'), 'VAT above 50% is not plausible').nullable(),
  VAT_RATE_DRINK: fraction.refine((value) => new Decimal(value).lte('0.5'), 'VAT above 50% is not plausible').nullable(),
  MENU_PRICES_INCLUDE_VAT: z.boolean(),
  PRICE_BASIS: z.enum(['LATEST', 'WEIGHTED_AVG', 'MAX']),
  WASTAGE_PCT: fraction.refine((value) => new Decimal(value).lte('0.5'), 'wastage above 50% is not plausible'),
};

export const ASSUMPTION_DEFAULTS: Record<AssumptionKey, unknown> = {
  VAT_RATE: null,
  VAT_RATE_DRINK: null,
  MENU_PRICES_INCLUDE_VAT: true,
  PRICE_BASIS: 'LATEST',
  WASTAGE_PCT: '0',
};

export function toEngineAssumptions(stored: { key: string; value: unknown }[]): EngineAssumptions {
  const values = { ...ASSUMPTION_DEFAULTS };
  for (const row of stored) {
    if ((ASSUMPTION_KEYS as readonly string[]).includes(row.key)) values[row.key as AssumptionKey] = row.value;
  }
  const decimalOrNull = (value: unknown) => (typeof value === 'string' ? new Decimal(value) : null);
  return {
    vatRate: decimalOrNull(values.VAT_RATE),
    vatRateDrink: decimalOrNull(values.VAT_RATE_DRINK),
    menuPricesIncludeVat: values.MENU_PRICES_INCLUDE_VAT !== false,
    priceBasis: values.PRICE_BASIS as PriceBasis,
    wastagePct: decimalOrNull(values.WASTAGE_PCT) ?? new Decimal(0),
  };
}

/** What the client sees of the assumptions behind the figures: VAT rates as fractions, wastage as a fraction. */
export type AssumptionsJson = {
  vatRate: string | null;
  vatRateDrink: string | null;
  menuPricesIncludeVat: boolean;
  priceBasis: PriceBasis;
  wastagePct: string;
};

export function toAssumptionsJson(stored: { key: string; value: unknown }[]): AssumptionsJson {
  const assumptions = toEngineAssumptions(stored);
  return {
    vatRate: assumptions.vatRate?.toString() ?? null,
    vatRateDrink: assumptions.vatRateDrink?.toString() ?? null,
    menuPricesIncludeVat: assumptions.menuPricesIncludeVat,
    priceBasis: assumptions.priceBasis,
    wastagePct: assumptions.wastagePct.toString(),
  };
}
