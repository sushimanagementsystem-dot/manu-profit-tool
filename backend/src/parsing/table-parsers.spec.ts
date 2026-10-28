import { describeHeaderRow } from './column-detect';
import {
  parseInvoiceTable,
  parseMenuTable,
  parsePosTable,
  TableFormatError,
} from './table-parsers';

describe('table parsers: header recognition', () => {
  it('reads a Square-style POS export, keeping net and gross sales apart', () => {
    const result = parsePosTable([
      ['Item', 'Category', 'Qty', 'Gross Sales', 'Net Sales'],
      ['Burger', 'Mains', 320, '4,640.00', '4,088.00'],
    ]);
    expect(result.rows[0]).toMatchObject({
      itemName: 'Burger',
      quantity: '320',
      netRevenue: '4088',
      grossRevenue: '4640',
    });
  });

  it('reads revenue columns named by their VAT basis', () => {
    const result = parsePosTable([
      ['Product Name', 'Portions', 'Sales Excl. VAT', 'Sales Incl. VAT'],
      ['Soup', 12, 80, 90.8],
    ]);
    expect(result.rows[0]).toMatchObject({
      itemName: 'Soup',
      quantity: '12',
      netRevenue: '80',
      grossRevenue: '90.8',
    });
  });

  it('reads takings as gross revenue and does not treat a PLU code as the item name', () => {
    const result = parsePosTable([
      ['PLU', 'Dish', 'Pcs', 'Takings'],
      [1001, 'Fries', 40, 180],
    ]);
    expect(result.rows[0]).toMatchObject({
      itemName: 'Fries',
      quantity: '40',
      grossRevenue: '180',
    });
  });

  it('reads a menu with different words for the same things', () => {
    const result = parseMenuTable([
      ['Dish Name', 'Menu Group', 'RRP'],
      ['Soup of the Day', 'Starters', '7.50'],
    ]);
    expect(result.items[0]).toMatchObject({
      name: 'Soup of the Day',
      category: 'Starters',
      price: '7.5',
    });
  });

  it('reads a spreadsheet invoice from a supplier who words everything differently', () => {
    const result = parseInvoiceTable([
      [
        'Company',
        'Inv No',
        'Document Date',
        'Item Description',
        'Qty Delivered',
        'Unit Cost',
        'Net Total',
      ],
      [
        'Acme Foods',
        'A-1',
        '2026-09-03',
        'Beef Mince 6 x 2.5kg',
        3,
        '45.00',
        '135.00',
      ],
    ]);
    expect(result.invoices[0]).toMatchObject({
      supplierName: 'Acme Foods',
      invoiceNumber: 'A-1',
      invoiceDate: '2026-09-03',
    });
    expect(result.invoices[0].lines[0]).toMatchObject({
      description: 'Beef Mince 6 x 2.5kg',
      quantity: '3',
      unitPrice: '45',
      lineNet: '135',
    });
  });
});

describe('table parsers: invoice columns that share words', () => {
  it('keeps "Unit Price" as the price when the file has no pack column', () => {
    const result = parseInvoiceTable([
      ['Description', 'Qty', 'Unit Price', 'Net Amount'],
      ['Flour 16kg', 2, '17.00', '34.00'],
    ]);
    expect(result.invoices[0].lines[0]).toMatchObject({
      unitPrice: '17',
      packUnit: null,
    });
  });

  it('still reads a real pack column next to the unit price', () => {
    const result = parseInvoiceTable([
      ['Description', 'Qty', 'Pack Size', 'Unit Price', 'Net Amount'],
      ['Buns', 10, 'dozen', '3.60', '36.00'],
    ]);
    expect(result.invoices[0].lines[0]).toMatchObject({
      unitPrice: '3.6',
      packUnit: 'dozen',
    });
  });
});

describe('table parsers: a file they cannot read', () => {
  it('tells the client what was wanted and what the file has', () => {
    expect.assertions(4);
    try {
      parsePosTable([
        ['Zone', 'Covers', 'Staff'],
        ['Bar', 10, 2],
      ]);
    } catch (error) {
      expect(error).toBeInstanceOf(TableFormatError);
      const message = (error as Error).message;
      expect(message).toContain('item name and quantity sold');
      expect(message).toContain('"Zone", "Covers", "Staff"');
      // The internal field names must not leak into the client's message.
      expect(message).not.toContain('itemName');
    }
  });

  it('asks for a header row when there is none', () => {
    expect(() =>
      parseMenuTable([
        [1, 2],
        [3, 4],
      ]),
    ).toThrow('no header row');
  });

  it('describes the header row that has the most text, and shortens very long cells', () => {
    expect(
      describeHeaderRow([
        [1, 2],
        ['a', 'b', 'c'],
      ]),
    ).toEqual(['a', 'b', 'c']);
    expect(describeHeaderRow([['x'.repeat(50)]])[0]).toHaveLength(30);
  });
});
