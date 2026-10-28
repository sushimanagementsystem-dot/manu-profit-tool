import type { Confidence } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import { toEngineAssumptions } from './assumptions';
import type { ConfidenceLevel, EngineInput } from './engine';

/** A Prisma client or an interactive-transaction client; both expose the same model API. */
export type Db = Prisma.TransactionClient;

const MATCH_CONFIDENCE: Record<string, ConfidenceLevel> = {
  EXACT: 'VERIFIED',
  USER: 'VERIFIED',
  FUZZY: 'PARTIALLY_VERIFIED',
};

/** Loads everything the calculation engine needs for one job, in engine terms. */
export async function loadEngineInput(db: Db, jobId: string): Promise<EngineInput> {
  const [assumptions, menuItems, posLines, matches, ingredients, recipeLines] = await Promise.all([
    db.assumption.findMany({ where: { jobId } }),
    db.menuItem.findMany({ where: { jobId }, orderBy: { name: 'asc' } }),
    db.posSalesLine.findMany({ where: { jobId, isDuplicate: false } }),
    db.matchSuggestion.findMany({ where: { jobId } }),
    db.ingredient.findMany({
      where: { jobId },
      include: {
        prices: { include: { invoiceLine: { select: { confidence: true, baseQuantity: true } } } },
      },
      orderBy: { name: 'asc' },
    }),
    db.recipeLine.findMany({ where: { jobId } }),
  ]);

  const methodByPosName = new Map(matches.map((match) => [match.posNormalizedName, match.method]));
  const matched = posLines.filter((line) => line.menuItemId);
  const unmatched = posLines.filter((line) => !line.menuItemId);

  return {
    assumptions: toEngineAssumptions(assumptions),
    menuItems: menuItems.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      grossPrice: item.grossPrice,
      priceConfidence: toLevel(item.confidence),
      costOverride: item.costOverride,
    })),
    sales: matched.map((line) => ({
      menuItemId: line.menuItemId as string,
      quantity: line.quantity,
      netRevenue: line.netRevenue,
      grossRevenue: line.grossRevenue,
      matchConfidence: MATCH_CONFIDENCE[methodByPosName.get(line.normalizedName) ?? 'FUZZY'],
    })),
    unmatchedSales: aggregateUnmatched(unmatched),
    ingredients: ingredients.map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      baseUnit: ingredient.baseUnit,
      prices: ingredient.prices.map((price) => ({
        pricePerBaseUnit: price.pricePerBaseUnit,
        source: price.source,
        date: price.effectiveDate,
        baseQuantity: price.invoiceLine?.baseQuantity ?? null,
        confidence: price.invoiceLine ? toLevel(price.invoiceLine.confidence) : 'PARTIALLY_VERIFIED',
        createdAt: price.createdAt,
      })),
    })),
    recipeLines: recipeLines.map((line) => ({
      id: line.id,
      menuItemId: line.menuItemId,
      ingredientId: line.ingredientId,
      baseQuantity: line.baseQuantity,
      source: line.source,
    })),
  };
}

function toLevel(confidence: Confidence): ConfidenceLevel {
  return confidence;
}

function aggregateUnmatched(lines: { rawItemName: string; normalizedName: string; quantity: Prisma.Decimal; netRevenue: Prisma.Decimal | null; grossRevenue: Prisma.Decimal | null }[]): EngineInput['unmatchedSales'] {
  const byName = new Map<string, EngineInput['unmatchedSales'][number]>();
  for (const line of lines) {
    const current = byName.get(line.normalizedName);
    if (!current) {
      byName.set(line.normalizedName, {
        name: line.rawItemName,
        quantity: line.quantity,
        netRevenue: line.netRevenue,
        grossRevenue: line.grossRevenue,
      });
      continue;
    }
    current.quantity = current.quantity.plus(line.quantity);
    current.netRevenue = current.netRevenue && line.netRevenue ? current.netRevenue.plus(line.netRevenue) : null;
    current.grossRevenue = current.grossRevenue && line.grossRevenue ? current.grossRevenue.plus(line.grossRevenue) : null;
  }
  return [...byName.values()];
}
