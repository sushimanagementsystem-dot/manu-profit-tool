import { Injectable } from '@nestjs/common';

import { Decimal, sum } from '../common/decimal';
import type { MatchMethod, MatchStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { findBestMatch, MATCH_THRESHOLDS } from './similarity';

type PosName = { normalizedName: string; displayName: string };

/**
 * Links POS item names to menu items. Exact and high-scoring matches are applied
 * automatically; anything uncertain is stored as a PENDING suggestion and left unlinked
 * until the client confirms it (in Release 1, through the chat).
 */
@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  async run(jobId: string): Promise<{ menuBuiltFromPos: boolean }> {
    const posNames = await this.distinctPosNames(jobId);
    let menuItems = await this.prisma.menuItem.findMany({
      where: { jobId },
      select: { id: true, normalizedName: true },
    });

    const menuBuiltFromPos = menuItems.length === 0 && posNames.length > 0;
    if (menuBuiltFromPos) {
      await this.createMenuFromPos(jobId);
      menuItems = await this.prisma.menuItem.findMany({
        where: { jobId },
        select: { id: true, normalizedName: true },
      });
    }

    const exact = new Map(menuItems.map((item) => [item.normalizedName, item.id]));
    for (const posName of posNames) {
      const exactId = exact.get(posName.normalizedName);
      const best = exactId ? { candidateId: exactId, score: 1 } : findBestMatch(posName.normalizedName, menuItems);
      const method: MatchMethod = exactId ? 'EXACT' : 'FUZZY';
      const status: MatchStatus = best && best.score >= MATCH_THRESHOLDS.auto ? 'AUTO_ACCEPTED' : 'PENDING';

      await this.prisma.matchSuggestion.upsert({
        where: { jobId_posNormalizedName: { jobId, posNormalizedName: posName.normalizedName } },
        create: {
          jobId,
          posNormalizedName: posName.normalizedName,
          posDisplayName: posName.displayName,
          candidateId: best?.candidateId ?? null,
          score: new Decimal(best?.score ?? 0).toDecimalPlaces(4),
          method,
          status,
        },
        update: {},
      });
      if (status === 'AUTO_ACCEPTED') await this.link(jobId, posName.normalizedName, best!.candidateId);
    }
    return { menuBuiltFromPos };
  }

  /** Points every POS row with this name at a menu item (or unlinks it with null). */
  async link(jobId: string, posNormalizedName: string, menuItemId: string | null): Promise<void> {
    await this.prisma.posSalesLine.updateMany({
      where: { jobId, normalizedName: posNormalizedName },
      data: { menuItemId },
    });
  }

  private async distinctPosNames(jobId: string): Promise<PosName[]> {
    const rows = await this.prisma.posSalesLine.findMany({
      where: { jobId, isDuplicate: false },
      distinct: ['normalizedName'],
      select: { normalizedName: true, rawItemName: true },
      orderBy: { normalizedName: 'asc' },
    });
    return rows.map((row) => ({ normalizedName: row.normalizedName, displayName: row.rawItemName }));
  }

  /**
   * Without a readable menu, POS items become the menu. Their price is the average realised
   * gross price, marked as estimated.
   */
  private async createMenuFromPos(jobId: string): Promise<void> {
    const rows = await this.prisma.posSalesLine.findMany({ where: { jobId, isDuplicate: false } });
    const byName = new Map<string, typeof rows>();
    for (const row of rows) byName.set(row.normalizedName, [...(byName.get(row.normalizedName) ?? []), row]);

    await this.prisma.menuItem.createMany({
      data: [...byName.values()].map((group) => {
        const withGross = group.filter((row) => row.grossRevenue);
        const units = sum(withGross.map((row) => row.quantity));
        const price = units.gt(0) ? sum(withGross.map((row) => row.grossRevenue!)).dividedBy(units) : null;
        return {
          jobId,
          name: group[0].rawItemName,
          normalizedName: group[0].normalizedName,
          category: group[0].rawCategory,
          grossPrice: price?.toDecimalPlaces(2),
          confidence: price ? ('ESTIMATED' as const) : ('INCOMPLETE' as const),
          origin: 'EXTRACTED' as const,
        };
      }),
    });
  }
}
