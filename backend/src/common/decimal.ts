import { Prisma } from '../generated/prisma/client';

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export type DecimalValue = ConstructorParameters<typeof Prisma.Decimal>[0];

export const ZERO = new Decimal(0);

export function dec(value: DecimalValue): Decimal {
  return new Decimal(value);
}

export function decOrNull(value: DecimalValue | null | undefined): Decimal | null {
  return value === null || value === undefined ? null : new Decimal(value);
}

/** Serializes money/quantities for the API: full precision, as a string. */
export function toStr(value: Decimal | null | undefined, places = 4): string | null {
  return value ? value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places) : null;
}

export function sum(values: Decimal[]): Decimal {
  return values.reduce((total, value) => total.plus(value), ZERO);
}
