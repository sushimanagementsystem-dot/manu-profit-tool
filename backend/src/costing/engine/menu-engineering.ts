import { Decimal, sum, ZERO } from '../../common/decimal';
import type { CategoryResult, EngineResult, ItemResult } from './types';

const HUNDRED = new Decimal(100);
const POPULARITY_FACTOR = new Decimal('0.7');
export const UNCATEGORISED = 'Uncategorised';

const categoryOf = (item: ItemResult) => item.category ?? UNCATEGORISED;

/** Sales mix % and revenue mix % across all menu items. Mutates the given items. */
export function applyMixes(items: ItemResult[]): void {
  const totalUnits = sum(items.map((item) => item.unitsSold));
  const totalRevenue = sum(items.map((item) => item.netRevenue.value ?? ZERO));
  for (const item of items) {
    item.salesMixPercent = totalUnits.isZero() ? null : item.unitsSold.dividedBy(totalUnits).times(HUNDRED);
    item.revenueMixPercent =
      totalRevenue.isZero() || !item.netRevenue.value
        ? null
        : item.netRevenue.value.dividedBy(totalRevenue).times(HUNDRED);
  }
}

/**
 * Kasavana–Smith menu engineering, per category:
 * popular when the item's share of category units ≥ 70 % × (1 / items sold in category);
 * profitable when its GP per portion ≥ the category's unit-weighted average GP per portion.
 * Mutates the given items and returns the thresholds used.
 */
export function applyMenuEngineering(items: ItemResult[]): EngineResult['matrix'] {
  const thresholds: EngineResult['matrix']['categoryThresholds'] = [];

  for (const [category, members] of groupBy(items, categoryOf)) {
    const sold = members.filter((item) => item.unitsSold.gt(0));
    if (!sold.length) continue;
    const categoryUnits = sum(sold.map((item) => item.unitsSold));
    const popularityPercent = POPULARITY_FACTOR.dividedBy(sold.length).times(HUNDRED);

    const costed = sold.filter((item) => item.gpPerPortion.value);
    const costedUnits = sum(costed.map((item) => item.unitsSold));
    const averageGp = costedUnits.isZero()
      ? null
      : sum(costed.map((item) => (item.gpPerPortion.value as Decimal).times(item.unitsSold))).dividedBy(costedUnits);
    thresholds.push({ category, popularityPercent, averageGp });

    if (!averageGp) continue;
    for (const item of costed) {
      const share = item.unitsSold.dividedBy(categoryUnits).times(HUNDRED);
      const popular = share.gte(popularityPercent);
      const profitable = (item.gpPerPortion.value as Decimal).gte(averageGp);
      item.matrixClass = popular ? (profitable ? 'STAR' : 'PLOWHORSE') : profitable ? 'PUZZLE' : 'DOG';
    }
  }
  return { categoryThresholds: thresholds };
}

export function categoryRollups(items: ItemResult[]): CategoryResult[] {
  return [...groupBy(items, categoryOf)].map(([category, members]) => {
    const costed = members.filter((item) => item.theoreticalGp.value && item.netRevenue.value);
    const costedRevenue = sum(costed.map((item) => item.netRevenue.value as Decimal));
    const gp = costed.length ? sum(costed.map((item) => item.theoreticalGp.value as Decimal)) : null;
    return {
      category,
      items: members.length,
      unitsSold: sum(members.map((item) => item.unitsSold)),
      netRevenue: sum(members.map((item) => item.netRevenue.value ?? ZERO)),
      theoreticalGp: gp,
      gpPercent: gp && !costedRevenue.isZero() ? gp.dividedBy(costedRevenue).times(HUNDRED) : null,
    };
  });
}

function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const group = groups.get(key(value)) ?? [];
    group.push(value);
    groups.set(key(value), group);
  }
  return groups;
}
