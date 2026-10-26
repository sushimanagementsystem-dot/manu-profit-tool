import type { Decimal } from '../../common/decimal';
import type { ConfidenceLevel, Metric } from './types';

const ORDER: ConfidenceLevel[] = ['VERIFIED', 'PARTIALLY_VERIFIED', 'ESTIMATED', 'INCOMPLETE'];

/** The least trustworthy of the given levels. */
export function worst(...levels: ConfidenceLevel[]): ConfidenceLevel {
  return levels.reduce(
    (current, level) => (ORDER.indexOf(level) > ORDER.indexOf(current) ? level : current),
    'VERIFIED' as ConfidenceLevel,
  );
}

export function known(
  value: Decimal,
  confidence: ConfidenceLevel = 'VERIFIED',
  reasons: string[] = [],
): Metric {
  return { value, confidence, reasons };
}

export function incomplete(...reasons: string[]): Metric {
  return { value: null, confidence: 'INCOMPLETE', reasons };
}

/**
 * Combines input metrics for a derived value: incomplete if any input is, otherwise the
 * worst confidence, with all reasons kept (deduplicated).
 */
export function derive(inputs: Metric[], compute: (values: Decimal[]) => Decimal | null): Metric {
  const reasons = unique(inputs.flatMap((input) => input.reasons));
  if (inputs.some((input) => input.value === null)) return { value: null, confidence: 'INCOMPLETE', reasons };
  const value = compute(inputs.map((input) => input.value as Decimal));
  if (value === null) return { value: null, confidence: 'INCOMPLETE', reasons };
  return { value, confidence: worst(...inputs.map((input) => input.confidence)), reasons };
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
