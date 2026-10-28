import type { SnapshotPayload } from '../costing/snapshot.serializer';
import type { ImpactPreview } from '../revisions/impact';
import { ChatToolExecutor } from './chat-tool.executor';
import { CHAT_SYSTEM_PROMPT } from './chat.prompt';

const metric = (value: string | null, confidence = 'VERIFIED', reasons: string[] = []) => ({ value, confidence, reasons });

const item = (n: number, over: Record<string, unknown> = {}) => ({
  menuItemId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  name: `Dish ${n}`,
  category: 'Mains',
  grossPrice: '10.0000',
  vatRate: '0.135',
  netPrice: metric('8.8105'),
  costPerPortion: metric('3.0000'),
  costSource: 'RECIPE',
  gpPerPortion: metric('5.8105'),
  gpPercent: metric('66.0000'),
  foodCostPercent: metric('34.0000'),
  unitsSold: String(100 - n),
  netRevenue: metric('881.0500'),
  salesMixPercent: '5',
  revenueMixPercent: '5',
  theoreticalGp: metric(String(500 - n)),
  realisedGp: metric(null),
  matrixClass: 'STAR',
  confidence: 'VERIFIED',
  reasons: [],
  recipe: [{ ingredientName: 'a long duplicate of the recipe the model does not need' }],
  ...over,
});

const payload = {
  revision: 3,
  currency: 'EUR',
  summary: { itemsTotal: 14 },
  items: Array.from({ length: 14 }, (_, i) => item(i + 1)).concat([
    item(99, { costPerPortion: metric(null, 'INCOMPLETE', ['Dish 99 has no recipe yet', 'second', 'third']) }),
  ]),
  ingredients: [],
  issues: [],
  recommendations: [],
  pendingMatches: [],
} as unknown as SnapshotPayload;

const bigImpact = (): ImpactPreview => ({
  summary: {
    realisedGpBefore: '100',
    realisedGpAfter: '150',
    deltaGp: '50',
    gpPercentBefore: '10',
    gpPercentAfter: '12',
    itemsCostedBefore: 1,
    itemsCostedAfter: 13,
  },
  items: Array.from({ length: 13 }, (_, i) => ({
    menuItemId: String(i),
    name: `Dish ${i}`,
    gpPerPortionBefore: null,
    gpPerPortionAfter: '4',
    gpPercentBefore: null,
    gpPercentAfter: '50',
    deltaGpContribution: String(i),
  })),
});

function executor() {
  const prisma = { recipeLine: { findMany: jest.fn().mockResolvedValue([]) } };
  const snapshots = { get: jest.fn().mockResolvedValue({ payload }) };
  const revisions = {
    preview: jest.fn().mockResolvedValue(bigImpact()),
    propose: jest.fn().mockResolvedValue({ revisionId: 'rev-1', impact: bigImpact() }),
  };
  const instance = new ChatToolExecutor(prisma as never, snapshots as never, revisions as never);
  return { instance, revisions };
}

const ctx = { jobId: 'job-1', revision: 3 };

describe('ChatToolExecutor result size', () => {
  it('lists ten items by default and drops fields the model does not need', async () => {
    const { result } = await executor().instance.execute('list_items', {}, ctx);
    const items = (result as { items: Record<string, unknown>[] }).items;
    expect(items).toHaveLength(10);
    expect(items[0]).not.toHaveProperty('confidence');
    expect(items[0].costPerPortion).toBe('3.0000'); // a firm figure is just its value
  });

  it('keeps the caveat on a figure that is not firm, trimmed', async () => {
    const { result } = await executor().instance.execute('list_items', { onlyMissingCost: true }, ctx);
    const [first] = (result as { items: { costPerPortion: { confidence: string; reasons: string[] } }[] }).items;
    expect(first.costPerPortion.confidence).toBe('INCOMPLETE');
    expect(first.costPerPortion.reasons).toHaveLength(2);
  });

  it('describes one dish without the snapshot extras', async () => {
    const { result } = await executor().instance.execute('get_item', { menuItemId: item(1).menuItemId }, ctx);
    const dish = result as Record<string, unknown>;
    expect(dish.name).toBe('Dish 1');
    expect(dish).not.toHaveProperty('salesMixPercent');
    expect(dish).not.toHaveProperty('vatRate');
    expect(dish.recipe).toEqual([]); // from the database, not the duplicate in the snapshot
  });

  it('shows the model a trimmed preview but hands the card the full impact', async () => {
    const { instance } = executor();
    const preview = await instance.execute('preview_changes', { operations: [{ op: 'SET_ASSUMPTION', key: 'VAT_RATE', value: '0.135' }] }, ctx);
    expect((preview.result as ImpactPreview).items).toHaveLength(8);

    const proposed = await instance.execute(
      'propose_changes',
      { operations: [{ op: 'SET_ASSUMPTION', key: 'VAT_RATE', value: '0.135' }], summary: 'Set VAT' },
      ctx,
    );
    expect((proposed.result as { impact: ImpactPreview }).impact.items).toHaveLength(8);
    expect(proposed.impact?.items).toHaveLength(13);
    expect(proposed.proposal).toEqual({ revisionId: 'rev-1', summary: 'Set VAT' });
  });
});

describe('CHAT_SYSTEM_PROMPT', () => {
  it('is byte-stable: nothing in it depends on the request', () => {
    expect(CHAT_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}|\$\{/);
  });

  it('keeps the rules the product depends on', () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/nothing is saved until they confirm/i);
    expect(CHAT_SYSTEM_PROMPT).toMatch(/never invent an id/i);
    expect(CHAT_SYSTEM_PROMPT).toMatch(/independent tools together/i);
    expect(CHAT_SYSTEM_PROMPT).toMatch(/only when a wrong guess/i);
    expect(CHAT_SYSTEM_PROMPT).toMatch(/greeting or small talk/i);
  });
});
