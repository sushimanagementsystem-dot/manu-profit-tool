import { operationSchema, operationsSchema } from './operations.schema';

const id = '3f2b8f0e-7a52-4f65-9d57-1f0b5d3c9a11';
const accepts = (operation: unknown) =>
  operationSchema.safeParse(operation).success;

describe('operations a client can make from the results table', () => {
  it('renames a dish, trimming the name and refusing an empty or huge one', () => {
    expect(
      operationSchema.parse({
        op: 'RENAME_MENU_ITEM',
        menuItemId: id,
        name: '  Smash Burger ',
      }),
    ).toMatchObject({
      name: 'Smash Burger',
    });
    expect(
      accepts({ op: 'RENAME_MENU_ITEM', menuItemId: id, name: '   ' }),
    ).toBe(false);
    expect(
      accepts({
        op: 'RENAME_MENU_ITEM',
        menuItemId: id,
        name: 'x'.repeat(201),
      }),
    ).toBe(false);
  });

  it('sets units sold to zero or more, with at most four decimals', () => {
    expect(
      accepts({ op: 'SET_UNITS_SOLD', menuItemId: id, quantity: '0' }),
    ).toBe(true);
    expect(
      accepts({ op: 'SET_UNITS_SOLD', menuItemId: id, quantity: '1580.5' }),
    ).toBe(true);
    for (const quantity of ['-1', '1.23456', 'abc', '', '1e3', '12345678901']) {
      expect(accepts({ op: 'SET_UNITS_SOLD', menuItemId: id, quantity })).toBe(
        false,
      );
    }
  });

  it('sets a cost per portion, or clears it with null', () => {
    expect(accepts({ op: 'SET_ITEM_COST', menuItemId: id, cost: '3.20' })).toBe(
      true,
    );
    expect(accepts({ op: 'SET_ITEM_COST', menuItemId: id, cost: '0' })).toBe(
      true,
    );
    expect(accepts({ op: 'SET_ITEM_COST', menuItemId: id, cost: null })).toBe(
      true,
    );
    expect(accepts({ op: 'SET_ITEM_COST', menuItemId: id, cost: '-3' })).toBe(
      false,
    );
    expect(accepts({ op: 'SET_ITEM_COST', menuItemId: id })).toBe(false);
  });

  it('refuses an id that is not a uuid, so a typo never reaches the database', () => {
    expect(
      accepts({ op: 'SET_UNITS_SOLD', menuItemId: 'burger', quantity: '5' }),
    ).toBe(false);
  });

  it('caps one request at 200 operations, and needs at least one', () => {
    const one = { op: 'SET_UNITS_SOLD', menuItemId: id, quantity: '5' };
    expect(operationsSchema.safeParse([]).success).toBe(false);
    expect(operationsSchema.safeParse(Array(201).fill(one)).success).toBe(
      false,
    );
    expect(operationsSchema.safeParse([one]).success).toBe(true);
  });
});
