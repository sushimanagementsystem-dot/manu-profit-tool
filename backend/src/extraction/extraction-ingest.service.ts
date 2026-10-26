import { Injectable } from '@nestjs/common';

import { Decimal, sum } from '../common/decimal';
import type { Confidence } from '../generated/prisma/enums';
import { normalizeName } from '../normalization/names';
import { parseAmount, parseDate } from '../parsing/values';
import { PrismaService } from '../prisma/prisma.service';
import type {
  DocumentExtraction,
  InvoiceExtraction,
  MenuExtraction,
  PosExtraction,
} from './extraction.schemas';
import { buildInvoiceLine } from './invoice-line.builder';

const TOTAL_TOLERANCE = new Decimal('0.01');

type IngestContext = { jobId: string; fileId: string; fromAi: boolean };

/**
 * Persists one file's extracted content. Deterministic parsers and the n8n AI workflow both
 * produce a DocumentExtraction, so there is a single path from "document" to database rows.
 * Returns user-facing warnings for the progress panel.
 */
@Injectable()
export class ExtractionIngestService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(jobId: string, fileId: string, extraction: DocumentExtraction, fromAi: boolean): Promise<string[]> {
    const context: IngestContext = { jobId, fileId, fromAi };
    switch (extraction.category) {
      case 'MENU':
        return this.ingestMenu(context, extraction.data);
      case 'POS':
        return this.ingestPos(context, extraction.data);
      case 'INVOICE':
        return this.ingestInvoices(context, extraction.data);
    }
  }

  private async ingestMenu({ jobId, fileId, fromAi }: IngestContext, data: MenuExtraction): Promise<string[]> {
    const warnings = [...data.warnings];
    const baseConfidence: Confidence = fromAi ? 'PARTIALLY_VERIFIED' : 'VERIFIED';
    const rows = data.items.map((item) => {
      const price = parseAmount(item.price);
      return {
        jobId,
        sourceFileId: fileId,
        sourceRef: item.sourceRef,
        name: item.name,
        normalizedName: normalizeName(item.name),
        category: item.category,
        description: item.description,
        grossPrice: price,
        confidence: price ? baseConfidence : ('INCOMPLETE' as const),
      };
    });
    const missingPrices = rows.filter((row) => !row.grossPrice).length;
    if (missingPrices) warnings.push(`${missingPrices} menu item(s) have no readable price.`);
    await this.prisma.menuItem.createMany({ data: rows });
    return warnings;
  }

  private async ingestPos({ jobId, fileId, fromAi }: IngestContext, data: PosExtraction): Promise<string[]> {
    const warnings = [...data.warnings];
    const fallbackStart = parseDate(data.periodStart);
    const fallbackEnd = parseDate(data.periodEnd);
    let skipped = 0;

    const rows = data.rows.flatMap((row) => {
      const quantity = parseAmount(row.quantity);
      if (!quantity) {
        skipped++;
        return [];
      }
      const date = parseDate(row.date);
      return [
        {
          jobId,
          sourceFileId: fileId,
          sourceRef: row.sourceRef,
          rawItemName: row.itemName,
          normalizedName: normalizeName(row.itemName),
          rawCategory: row.category,
          periodStart: date ?? fallbackStart,
          periodEnd: date ?? fallbackEnd,
          quantity,
          netRevenue: parseAmount(row.netRevenue),
          grossRevenue: parseAmount(row.grossRevenue),
          confidence: (fromAi ? 'PARTIALLY_VERIFIED' : 'VERIFIED') as Confidence,
        },
      ];
    });
    if (skipped) warnings.push(`${skipped} POS row(s) had no quantity and were skipped.`);
    await this.prisma.posSalesLine.createMany({ data: rows });
    return warnings;
  }

  private async ingestInvoices(context: IngestContext, data: InvoiceExtraction): Promise<string[]> {
    const warnings = [...data.warnings];
    for (const invoice of data.invoices) {
      warnings.push(...(await this.ingestInvoice(context, invoice)));
    }
    return warnings;
  }

  private async ingestInvoice(
    { jobId, fileId, fromAi }: IngestContext,
    invoice: InvoiceExtraction['invoices'][number],
  ): Promise<string[]> {
    const warnings: string[] = [];
    const lines = invoice.lines.map((line) => buildInvoiceLine(line, fromAi));
    const netTotal = parseAmount(invoice.totals.net);
    const linesTotal = sum(lines.flatMap((line) => (line.lineNet ? [line.lineNet] : [])));
    const totalsMatch = netTotal ? netTotal.minus(linesTotal).abs().lte(netTotal.abs().times(TOTAL_TOLERANCE)) : null;
    const supplierNormalized = invoice.supplierName ? normalizeName(invoice.supplierName) : null;
    const label = [invoice.supplierName, invoice.invoiceNumber].filter(Boolean).join(' ') || 'An invoice';

    const duplicate = await this.findDuplicate(jobId, supplierNormalized, invoice.invoiceNumber, invoice.invoiceDate, netTotal);
    if (duplicate) warnings.push(`${label} appears twice; the duplicate is ignored.`);
    if (totalsMatch === false) {
      warnings.push(`${label}: the line totals don't add up to the invoice net total; its prices are marked uncertain.`);
    }

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.supplierInvoice.create({
        data: {
          jobId,
          sourceFileId: fileId,
          supplierName: invoice.supplierName,
          supplierNormalized,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: parseDate(invoice.invoiceDate),
          currency: invoice.currency?.slice(0, 3).toUpperCase() ?? null,
          netTotal,
          vatTotal: parseAmount(invoice.totals.vat),
          grossTotal: parseAmount(invoice.totals.gross),
          duplicateOfId: duplicate,
          checks: { linesTotal: linesTotal.toString(), totalsMatch },
          confidence: totalsMatch === false ? 'ESTIMATED' : fromAi ? 'PARTIALLY_VERIFIED' : 'VERIFIED',
        },
      });
      await tx.invoiceLine.createMany({
        data: lines.map((line) => ({
          ...line,
          jobId,
          invoiceId: created.id,
          confidence: totalsMatch === false && line.confidence !== 'INCOMPLETE' ? 'ESTIMATED' : line.confidence,
        })),
      });
    });
    return warnings;
  }

  /** Same supplier + invoice number, or same supplier + date + net total, is the same invoice. */
  private async findDuplicate(
    jobId: string,
    supplierNormalized: string | null,
    invoiceNumber: string | null,
    invoiceDate: string | null,
    netTotal: Decimal | null,
  ): Promise<string | null> {
    if (!supplierNormalized) return null;
    const date = parseDate(invoiceDate);
    const match = await this.prisma.supplierInvoice.findFirst({
      where: {
        jobId,
        supplierNormalized,
        duplicateOfId: null,
        OR: [
          ...(invoiceNumber ? [{ invoiceNumber }] : []),
          ...(date && netTotal ? [{ invoiceDate: date, netTotal }] : []),
        ],
      },
      select: { id: true },
    });
    return invoiceNumber || (date && netTotal) ? (match?.id ?? null) : null;
  }
}
