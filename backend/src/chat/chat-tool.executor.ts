import { Injectable } from '@nestjs/common';

import { Decimal } from '../common/decimal';
import { ProblemException } from '../common/problem';
import { SnapshotService } from '../costing/snapshot.service';
import type { SnapshotPayload } from '../costing/snapshot.serializer';
import { normalizeName } from '../normalization/names';
import { PrismaService } from '../prisma/prisma.service';
import type { ImpactPreview } from '../revisions/impact';
import { RevisionsService } from '../revisions/revisions.service';
import { impactForModel } from './chat.compact';
import { chatToolSchemas, type ChatToolName } from './chat.tools';

export type ToolOutcome = {
  /** JSON returned to the model as the tool result. */
  result: unknown;
  isError?: boolean;
  /** Set when the tool created a proposal the user must confirm. */
  proposal?: { revisionId: string; summary: string };
  /** The full before/after for the confirmation card; the model is only given a trimmed copy. */
  impact?: ImpactPreview;
};

type ToolContext = { jobId: string; revision: number };

type MetricLike = { value: string | null; confidence: string; reasons: string[] };

/** A figure as the model needs it: just the value when it is firm, with the caveat when it is not. */
const plain = (metric: MetricLike) =>
  metric.confidence === 'VERIFIED' && metric.value !== null
    ? metric.value
    : { value: metric.value, confidence: metric.confidence, reasons: metric.reasons.slice(0, 2) };

/**
 * Runs the assistant's tools against one job. All data access is scoped to that job, and the
 * only mutating tool (`propose_changes`) creates a proposal that the user must confirm —
 * the model never writes to the database.
 */
@Injectable()
export class ChatToolExecutor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: SnapshotService,
    private readonly revisions: RevisionsService,
  ) {}

  async execute(name: string, rawInput: unknown, context: ToolContext): Promise<ToolOutcome> {
    if (!(name in chatToolSchemas)) {
      return { result: { error: `Unknown tool "${name}".` }, isError: true };
    }
    const parsed = chatToolSchemas[name as ChatToolName].safeParse(rawInput ?? {});
    if (!parsed.success) {
      return {
        result: { error: 'Invalid arguments.', issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) },
        isError: true,
      };
    }

    try {
      return await this.dispatch(name as ChatToolName, parsed.data as never, context);
    } catch (error) {
      if (error instanceof ProblemException) {
        return { result: { error: error.detail ?? 'The request was not valid.' }, isError: true };
      }
      throw error;
    }
  }

  private async dispatch(name: ChatToolName, input: never, context: ToolContext): Promise<ToolOutcome> {
    const payload = () => this.snapshots.get(context.jobId).then((snapshot) => snapshot.payload);

    switch (name) {
      case 'get_summary': {
        const data = await payload();
        return { result: { ...data.summary, currency: data.currency, revision: data.revision } };
      }
      case 'list_items':
        return { result: await this.listItems(await payload(), input) };
      case 'get_item':
        return { result: await this.getItem(context.jobId, await payload(), (input as { menuItemId: string }).menuItemId) };
      case 'search_items':
        return { result: await this.searchItems(context.jobId, (input as { query: string }).query) };
      case 'search_ingredients':
        return { result: await this.searchIngredients(context.jobId, (input as { query: string }).query) };
      case 'get_data_quality': {
        const data = await payload();
        return { result: { issues: data.issues, recommendations: data.recommendations.map(({ title, kind, impactGp }) => ({ title, kind, impactGp })) } };
      }
      case 'list_unmatched_pos_items': {
        const data = await payload();
        return { result: { items: data.pendingMatches } };
      }
      case 'preview_changes': {
        const { operations } = input as { operations: never };
        const impact = await this.revisions.preview(context.jobId, operations);
        return { result: impactForModel(impact) };
      }
      case 'propose_changes': {
        const { operations, summary } = input as { operations: never; summary: string };
        const proposal = await this.revisions.propose(context.jobId, context.revision, operations, summary);
        return {
          result: {
            status: 'awaiting_confirmation',
            note: 'The user has been shown a confirmation card. Nothing is saved yet.',
            impact: impactForModel(proposal.impact),
          },
          impact: proposal.impact,
          proposal: { revisionId: proposal.revisionId, summary },
        };
      }
    }
  }

  private listItems(
    payload: SnapshotPayload,
    input: { sortBy: string; order: 'asc' | 'desc'; onlyMissingCost: boolean; category?: string; limit: number },
  ) {
    const sortValue = (item: SnapshotPayload['items'][number]) => {
      switch (input.sortBy) {
        case 'gpPercent':
          return item.gpPercent.value;
        case 'unitsSold':
          return item.unitsSold;
        case 'netRevenue':
          return item.netRevenue.value;
        case 'name':
          return null;
        default:
          return item.theoreticalGp.value;
      }
    };

    const items = payload.items
      .filter((item) => (input.onlyMissingCost ? item.costPerPortion.value === null : true))
      .filter((item) => (input.category ? item.category?.toLowerCase() === input.category.toLowerCase() : true))
      .sort((a, b) => {
        if (input.sortBy === 'name') return a.name.localeCompare(b.name);
        const left = sortValue(a);
        const right = sortValue(b);
        if (left === null) return 1;
        if (right === null) return -1;
        const comparison = new Decimal(left).comparedTo(new Decimal(right));
        return input.order === 'asc' ? comparison : -comparison;
      })
      .slice(0, input.limit)
      .map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        category: item.category,
        netPrice: item.netPrice.value,
        costPerPortion: plain(item.costPerPortion),
        gpPerPortion: item.gpPerPortion.value,
        gpPercent: item.gpPercent.value,
        unitsSold: item.unitsSold,
        gpContribution: item.theoreticalGp.value,
        matrixClass: item.matrixClass,
      }));
    return { currency: payload.currency, count: items.length, items };
  }

  private async getItem(jobId: string, payload: SnapshotPayload, menuItemId: string) {
    const item = payload.items.find((candidate) => candidate.menuItemId === menuItemId);
    if (!item) return { error: 'No menu item with that id in this analysis.' };

    const recipeLines = await this.prisma.recipeLine.findMany({
      where: { jobId, menuItemId },
      include: { ingredient: { select: { id: true, name: true, baseUnit: true } } },
    });
    const unitCosts = new Map(payload.ingredients.map((ingredient) => [ingredient.ingredientId, ingredient.unitCost]));

    return {
      // Only what answers a question about one dish; the snapshot carries much more (mix %, VAT
      // detail, a second copy of the recipe) that the model never needs.
      menuItemId: item.menuItemId,
      name: item.name,
      category: item.category,
      currency: payload.currency,
      grossPrice: item.grossPrice,
      netPrice: plain(item.netPrice),
      costPerPortion: plain(item.costPerPortion),
      costSource: item.costSource,
      gpPerPortion: plain(item.gpPerPortion),
      gpPercent: plain(item.gpPercent),
      unitsSold: item.unitsSold,
      netRevenue: plain(item.netRevenue),
      matrixClass: item.matrixClass,
      recipe: recipeLines.map((line) => ({
        recipeLineId: line.id,
        ingredientId: line.ingredient.id,
        ingredientName: line.ingredient.name,
        quantity: line.quantity.toString(),
        unit: line.unit,
        baseQuantity: line.baseQuantity.toString(),
        baseUnit: line.ingredient.baseUnit,
        unitCost: unitCosts.get(line.ingredient.id)?.value ?? null,
        source: line.source,
      })),
    };
  }

  private async searchItems(jobId: string, query: string) {
    const items = await this.prisma.menuItem.findMany({
      where: {
        jobId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { normalizedName: { contains: normalizeName(query) } },
        ],
      },
      select: { id: true, name: true, category: true, grossPrice: true },
      take: 15,
    });
    return {
      items: items.map((item) => ({
        menuItemId: item.id,
        name: item.name,
        category: item.category,
        grossPrice: item.grossPrice?.toString() ?? null,
      })),
    };
  }

  private async searchIngredients(jobId: string, query: string) {
    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        jobId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { normalizedName: { contains: normalizeName(query) } },
        ],
      },
      select: { id: true, name: true, baseUnit: true },
      take: 15,
    });
    const payload = await this.snapshots.get(jobId).then((snapshot) => snapshot.payload);
    const unitCosts = new Map(payload.ingredients.map((ingredient) => [ingredient.ingredientId, ingredient.unitCost.value]));
    return {
      ingredients: ingredients.map((ingredient) => ({
        ingredientId: ingredient.id,
        name: ingredient.name,
        baseUnit: ingredient.baseUnit,
        costPerBaseUnit: unitCosts.get(ingredient.id) ?? null,
      })),
    };
  }
}
