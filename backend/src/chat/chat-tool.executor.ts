import { Injectable } from '@nestjs/common';

import { Decimal } from '../common/decimal';
import { ProblemException } from '../common/problem';
import { SnapshotService } from '../costing/snapshot.service';
import type { SnapshotPayload } from '../costing/snapshot.serializer';
import { normalizeName } from '../normalization/names';
import { PrismaService } from '../prisma/prisma.service';
import { RevisionsService } from '../revisions/revisions.service';
import { chatToolSchemas, type ChatToolName } from './chat.tools';

export type ToolOutcome = {
  /** JSON returned to the model as the tool result. */
  result: unknown;
  isError?: boolean;
  /** Set when the tool created a proposal the user must confirm. */
  proposal?: { revisionId: string; summary: string };
};

type ToolContext = { jobId: string; revision: number };

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
        return { result: await this.revisions.preview(context.jobId, operations) };
      }
      case 'propose_changes': {
        const { operations, summary } = input as { operations: never; summary: string };
        const proposal = await this.revisions.propose(context.jobId, context.revision, operations, summary);
        return {
          result: {
            status: 'awaiting_confirmation',
            note: 'The user has been shown a confirmation card. Nothing is saved yet.',
            impact: proposal.impact,
          },
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
        costPerPortion: item.costPerPortion.value,
        gpPerPortion: item.gpPerPortion.value,
        gpPercent: item.gpPercent.value,
        unitsSold: item.unitsSold,
        gpContribution: item.theoreticalGp.value,
        matrixClass: item.matrixClass,
        confidence: item.confidence,
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
      ...item,
      currency: payload.currency,
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
