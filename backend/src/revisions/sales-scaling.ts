import { Decimal, sum, ZERO } from '../common/decimal';

export type SalesLine = {
  id: string;
  quantity: Decimal;
  netRevenue: Decimal | null;
  grossRevenue: Decimal | null;
};

const PLACES = 4;
const round = (value: Decimal) => value.toDecimalPlaces(PLACES, Decimal.ROUND_HALF_UP);

/**
 * Changes the units sold of one menu item to `target`, across the POS lines linked to it.
 *
 * Each line keeps its share of the total and its revenue moves with its quantity, so the price
 * the till actually charged survives the edit; setting only the quantity would leave revenue at
 * the old figure and the two out of step. The rounding remainder goes to the biggest line, which
 * makes the lines add up to exactly `target`.
 *
 * When the item has sold nothing (every linked line is 0) there is no share to keep: the first
 * line takes the whole quantity and its revenue is cleared, so the engine estimates it from the
 * menu price rather than leaving a revenue of 0 beside real units.
 */
export function scaleSales(lines: SalesLine[], target: Decimal): SalesLine[] {
  if (!lines.length) throw new Error('scaleSales needs at least one line');
  const total = sum(lines.map((line) => line.quantity));

  if (total.isZero()) {
    return lines.map((line, index) =>
      index === 0
        ? { id: line.id, quantity: round(target), netRevenue: null, grossRevenue: null }
        : { ...line },
    );
  }

  const biggest = lines.reduce((best, line) => (line.quantity.gt(best.quantity) ? line : best));
  const scaled = new Map<string, Decimal>();
  for (const line of lines) {
    if (line.id !== biggest.id) scaled.set(line.id, round(line.quantity.times(target).dividedBy(total)));
  }
  scaled.set(biggest.id, round(target.minus(sum([...scaled.values()]))));

  return lines.map((line) => {
    const quantity = scaled.get(line.id) as Decimal;
    // A line that sold nothing has no price to carry over; its revenue stays as it was.
    const factor = line.quantity.isZero() ? null : quantity.dividedBy(line.quantity);
    const move = (revenue: Decimal | null) => (revenue && factor ? round(revenue.times(factor)) : revenue);
    return { id: line.id, quantity, netRevenue: move(line.netRevenue), grossRevenue: move(line.grossRevenue) };
  });
}

/** Units sold across the lines; used to describe the change. */
export const totalSold = (lines: SalesLine[]): Decimal => (lines.length ? sum(lines.map((line) => line.quantity)) : ZERO);
