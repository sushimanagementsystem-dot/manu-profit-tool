import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  invoiceExtractionSchema,
  menuExtractionSchema,
  posExtractionSchema,
} from './extraction.schemas';

/**
 * The MP-01 workflow and this backend agree on one shape, and only this test holds them to
 * it: n8n/workflows/MP-01.json asks Claude for a json_schema built to match these Zod
 * schemas, and the fixtures are what a correct run returns. Change one side without the
 * other and a real extraction would be rejected at the callback — here it fails in CI.
 */
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '../../../n8n/fixtures', name), 'utf8')) as unknown;

describe('MP-01 extraction contract', () => {
  it('accepts the invoice fixture, keeping nulls as nulls', () => {
    const parsed = invoiceExtractionSchema.parse(fixture('mp-01-invoice-result.json'));
    const [invoice] = parsed.invoices;
    expect(invoice.invoiceNumber).toBe('INV-1001');
    expect(invoice.lines).toHaveLength(3);

    const [beef, potatoes, garnish] = invoice.lines;
    expect(beef).toMatchObject({ packCount: '6', packSize: '2.5', packUnit: 'kg', unitPrice: '45.00' });
    // A pack with no multiplier keeps packCount null rather than defaulting it to 1.
    expect(potatoes.packCount).toBeNull();
    // An unreadable line survives with nulls instead of being dropped or zero-filled.
    expect(garnish).toMatchObject({ quantity: null, unitPrice: null, lineNet: '8.40', modelConfidence: 'low' });
    expect(parsed.warnings).toHaveLength(1);
  });

  it('accepts the menu fixture, including a dish with no printed price', () => {
    const parsed = menuExtractionSchema.parse(fixture('mp-01-menu-result.json'));
    expect(parsed.items).toHaveLength(4);
    expect(parsed.items.find((item) => item.name === 'Soup of the Day')?.price).toBeNull();
    // Two sizes of the same drink are two items, told apart by name.
    expect(parsed.items.filter((item) => item.name.startsWith('Craft Lager'))).toHaveLength(2);
  });

  it('accepts the POS fixture', () => {
    const parsed = posExtractionSchema.parse(fixture('mp-01-pos-result.json'));
    expect(parsed.periodStart).toBe('2026-09-01');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ itemName: 'CLASSIC BURGER', quantity: '320', netRevenue: '3680.00' });
  });

  it('rejects a result whose required field is missing', () => {
    expect(() => menuExtractionSchema.parse({ items: [{ category: 'Mains' }] })).toThrow();
  });

  it('rejects a number sent as a number rather than the printed string', () => {
    const result = menuExtractionSchema.safeParse({
      items: [{ name: 'Classic Burger', category: null, description: null, price: 14.5, sourceRef: null }],
      warnings: [],
    });
    // `.catch(null)` turns the wrong type into null rather than throwing: the price is lost,
    // not silently coerced to 14.5, so the item shows as uncosted instead of wrongly priced.
    expect(result.success).toBe(true);
    expect(result.success && result.data.items[0].price).toBeNull();
  });
});
