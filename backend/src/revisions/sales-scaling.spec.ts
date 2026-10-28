import { Decimal, sum } from '../common/decimal';
import { scaleSales, type SalesLine } from './sales-scaling';

const d = (value: string | number) => new Decimal(value);
const line = (id: string, quantity: string, net: string | null, gross: string | null = null): SalesLine => ({
  id,
  quantity: d(quantity),
  netRevenue: net === null ? null : d(net),
  grossRevenue: gross === null ? null : d(gross),
});
const quantities = (lines: SalesLine[]) => lines.map((l) => l.quantity.toString());

describe('scaleSales', () => {
  it('moves revenue with the quantity, so the price charged at the till survives', () => {
    // 320 burgers brought in 3,680 (11.50 each); selling 400 should bring in 4,600.
    const [scaled] = scaleSales([line('a', '320', '3680', '4177')], d(400));
    expect(scaled.quantity.toString()).toBe('400');
    expect(scaled.netRevenue?.toString()).toBe('4600');
    expect(scaled.grossRevenue?.toNumber()).toBeCloseTo(5221.25, 4);
  });

  it('keeps each line its share of the total', () => {
    const scaled = scaleSales([line('a', '100', '1000'), line('b', '300', '3000')], d(800));
    expect(quantities(scaled)).toEqual(['200', '600']);
    expect(scaled.map((l) => l.netRevenue?.toString())).toEqual(['2000', '6000']);
  });

  it('adds up to exactly the target even when the shares do not divide evenly', () => {
    const scaled = scaleSales([line('a', '1', '10'), line('b', '1', '10'), line('c', '1', '10')], d(100));
    expect(sum(scaled.map((l) => l.quantity)).toString()).toBe('100');
  });

  it('can bring the total down to zero, with its revenue', () => {
    const scaled = scaleSales([line('a', '50', '500'), line('b', '50', '500')], d(0));
    expect(quantities(scaled)).toEqual(['0', '0']);
    expect(scaled.map((l) => l.netRevenue?.toString())).toEqual(['0', '0']);
  });

  it('leaves a revenue that was never known as unknown', () => {
    const [scaled] = scaleSales([line('a', '10', null)], d(20));
    expect(scaled.quantity.toString()).toBe('20');
    expect(scaled.netRevenue).toBeNull();
  });

  it('gives a dish that sold nothing its units on the first line and clears the revenue', () => {
    const scaled = scaleSales([line('a', '0', '0'), line('b', '0', '0')], d(12));
    expect(quantities(scaled)).toEqual(['12', '0']);
    expect(scaled[0].netRevenue).toBeNull();
  });

  it('does not touch the lines it was given', () => {
    const input = [line('a', '10', '100')];
    scaleSales(input, d(30));
    expect(input[0].quantity.toString()).toBe('10');
  });
});
