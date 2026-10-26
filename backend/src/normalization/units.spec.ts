import { Decimal } from '../common/decimal';
import { parsePackFromText, resolveBaseQuantity, toBaseQuantity } from './units';

const base = (description: string, packCount?: string, packSize?: string, packUnit?: string) =>
  resolveBaseQuantity({
    description,
    packCount: packCount ? new Decimal(packCount) : null,
    packSize: packSize ? new Decimal(packSize) : null,
    packUnit: packUnit ?? null,
  });

describe('parsePackFromText', () => {
  it.each([
    ['Beef Mince 6 x 2.5kg', '6', '2.5', 'kg'],
    ['Tomatoes 5kg', '1', '5', 'kg'],
    ['Case 12 x 1L Milk', '12', '1', 'l'],
    ['Olive Oil 750ml', '1', '750', 'ml'],
    ['Cream 12x500 ml', '12', '500', 'ml'],
    ['Flour 1,5 kg', '1', '1.5', 'kg'],
  ])('reads "%s"', (text, count, size, unit) => {
    const pack = parsePackFromText(text);
    expect(pack?.packCount.toString()).toBe(count);
    expect(pack?.packSize.toString()).toBe(size);
    expect(pack?.packUnit).toBe(unit);
  });

  it('returns null when there is no size in the text', () => {
    expect(parsePackFromText('Romaine Lettuce')).toBeNull();
  });
});

describe('resolveBaseQuantity', () => {
  it('multiplies pack count by pack size for a case', () => {
    const result = base('Beef Mince 6 x 2.5kg');
    expect(result.baseUnit).toBe('G');
    expect(result.perInvoicedUnit.toString()).toBe('15000');
    expect(result.assumed).toBe(false);
  });

  it('prefers explicit pack fields over the description', () => {
    const result = base('Cheddar Cheese 2kg', '1', '5', 'kg');
    expect(result.perInvoicedUnit.toString()).toBe('5000');
  });

  it('treats a bare unit as one of that unit per invoiced quantity', () => {
    const result = base('Potatoes', undefined, undefined, 'kg');
    expect(result.baseUnit).toBe('G');
    expect(result.perInvoicedUnit.toString()).toBe('1000');
  });

  it('converts dozens to item counts', () => {
    const result = base('Burger Buns', '10', undefined, 'dozen');
    expect(result.baseUnit).toBe('EACH');
    expect(result.perInvoicedUnit.toString()).toBe('120');
  });

  it('flags an assumption when no size is given at all', () => {
    const result = base('Romaine Lettuce');
    expect(result).toMatchObject({ baseUnit: 'EACH', assumed: true });
    expect(result.perInvoicedUnit.toString()).toBe('1');
  });
});

describe('toBaseQuantity', () => {
  it('converts within a measurement family', () => {
    expect(toBaseQuantity(new Decimal('1.5'), 'kg', 'G')?.toString()).toBe('1500');
    expect(toBaseQuantity(new Decimal('2'), 'l', 'ML')?.toString()).toBe('2000');
    expect(toBaseQuantity(new Decimal('1'), 'oz', 'G')?.toString()).toBe('28.349523125');
  });

  it('refuses to convert between families rather than guessing', () => {
    expect(toBaseQuantity(new Decimal('1'), 'kg', 'ML')).toBeNull();
    expect(toBaseQuantity(new Decimal('1'), 'bunch', 'G')).toBeNull();
  });
});
