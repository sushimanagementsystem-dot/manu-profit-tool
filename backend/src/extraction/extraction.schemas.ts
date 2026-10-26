import { z } from 'zod';

/**
 * The document contract shared by the deterministic spreadsheet parsers and the n8n MP-01
 * AI extraction workflow. Numbers are strings exactly as printed (dot decimal), or null when
 * unreadable — values are never invented. Keep in sync with docs/N8N_WORKFLOWS.md.
 */
export const EXTRACTION_SCHEMA_VERSION = '1';

const text = z.string().trim().min(1).max(500);
const optionalText = z.string().trim().max(500).nullable().catch(null);
const amount = z.string().trim().max(40).nullable().catch(null);
const sourceRef = z.string().max(100).nullable().catch(null);

export const menuExtractionSchema = z.object({
  items: z
    .array(
      z.object({
        name: text,
        category: optionalText,
        description: z.string().trim().max(2000).nullable().catch(null),
        price: amount,
        sourceRef,
      }),
    )
    .max(2000),
  warnings: z.array(z.string().max(500)).max(100).default([]),
});

export const posExtractionSchema = z.object({
  periodStart: optionalText,
  periodEnd: optionalText,
  rows: z
    .array(
      z.object({
        itemName: text,
        category: optionalText,
        quantity: amount,
        netRevenue: amount,
        grossRevenue: amount,
        date: optionalText,
        sourceRef,
      }),
    )
    .max(50_000),
  warnings: z.array(z.string().max(500)).max(100).default([]),
});

export const invoiceExtractionSchema = z.object({
  invoices: z
    .array(
      z.object({
        supplierName: optionalText,
        invoiceNumber: optionalText,
        invoiceDate: optionalText,
        currency: optionalText,
        totals: z.object({ net: amount, vat: amount, gross: amount }).catch({
          net: null,
          vat: null,
          gross: null,
        }),
        lines: z
          .array(
            z.object({
              description: text,
              quantity: amount,
              packCount: amount,
              packSize: amount,
              packUnit: optionalText,
              unitPrice: amount,
              lineNet: amount,
              vatRate: amount,
              sourceRef,
              modelConfidence: z.enum(['high', 'medium', 'low']).nullable().catch(null),
            }),
          )
          .max(1000),
      }),
    )
    .max(200),
  warnings: z.array(z.string().max(500)).max(100).default([]),
});

export type MenuExtraction = z.infer<typeof menuExtractionSchema>;
export type PosExtraction = z.infer<typeof posExtractionSchema>;
export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;
export type InvoiceLineExtraction = InvoiceExtraction['invoices'][number]['lines'][number];

export type DocumentExtraction =
  | { category: 'MENU'; data: MenuExtraction }
  | { category: 'POS'; data: PosExtraction }
  | { category: 'INVOICE'; data: InvoiceExtraction };
