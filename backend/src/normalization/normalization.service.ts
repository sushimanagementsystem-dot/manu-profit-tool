import { Injectable } from '@nestjs/common';

import type { BaseUnit } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const UNIT_SUFFIX: Record<BaseUnit, string> = { G: 'by weight', ML: 'by volume', EACH: 'per item' };

/**
 * Builds the job's ingredient list from invoice products and records their prices, and
 * flags POS rows that were exported twice. Runs once per job after all files are extracted.
 */
@Injectable()
export class NormalizationService {
  constructor(private readonly prisma: PrismaService) {}

  async run(jobId: string): Promise<void> {
    await this.buildIngredients(jobId);
    await this.flagDuplicatePosRows(jobId);
  }

  /**
   * One ingredient per normalised product name and base unit. The same product bought by weight
   * and per item becomes two ingredients, because their prices aren't comparable.
   */
  private async buildIngredients(jobId: string): Promise<void> {
    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        jobId,
        ingredientId: null,
        costPerBaseUnit: { not: null },
        baseUnit: { not: null },
        invoice: { duplicateOfId: null },
      },
      include: { invoice: { select: { invoiceDate: true } } },
      orderBy: { id: 'asc' },
    });

    const unitsByName = new Map<string, Set<BaseUnit>>();
    for (const line of lines) {
      const units = unitsByName.get(line.normalizedName) ?? new Set<BaseUnit>();
      units.add(line.baseUnit as BaseUnit);
      unitsByName.set(line.normalizedName, units);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const baseUnit = line.baseUnit as BaseUnit;
        const ambiguous = (unitsByName.get(line.normalizedName)?.size ?? 0) > 1;
        const key = ambiguous ? `${line.normalizedName} ${UNIT_SUFFIX[baseUnit]}` : line.normalizedName;
        const ingredient = await tx.ingredient.upsert({
          where: { jobId_normalizedName: { jobId, normalizedName: key } },
          create: {
            jobId,
            normalizedName: key,
            name: ambiguous ? `${line.rawDescription} (${UNIT_SUFFIX[baseUnit]})` : line.rawDescription,
            baseUnit,
          },
          update: {},
        });
        await tx.invoiceLine.update({ where: { id: line.id }, data: { ingredientId: ingredient.id } });
        await tx.ingredientPrice.create({
          data: {
            jobId,
            ingredientId: ingredient.id,
            source: 'INVOICE',
            invoiceLineId: line.id,
            pricePerBaseUnit: line.costPerBaseUnit!,
            effectiveDate: line.invoice.invoiceDate,
          },
        });
      }
    });
  }

  /** Identical rows (item, period, quantity, revenue) coming from different files are duplicates. */
  private async flagDuplicatePosRows(jobId: string): Promise<void> {
    const rows = await this.prisma.posSalesLine.findMany({
      where: { jobId },
      orderBy: { id: 'asc' },
    });
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const row of rows) {
      const key = [
        row.normalizedName,
        row.periodStart?.toISOString(),
        row.periodEnd?.toISOString(),
        row.quantity.toString(),
        row.netRevenue?.toString(),
        row.grossRevenue?.toString(),
      ].join('|');
      const firstFile = seen.get(key);
      if (firstFile && firstFile !== row.sourceFileId) duplicates.push(row.id);
      else if (!firstFile) seen.set(key, row.sourceFileId);
    }
    if (duplicates.length) {
      await this.prisma.posSalesLine.updateMany({
        where: { id: { in: duplicates } },
        data: { isDuplicate: true },
      });
    }
  }
}
