import type { ImpactPreview } from '../revisions/impact';
import { buildToolDefinitions, chatToolSchemas } from './chat.tools';
import { buildSystemNote, compactSchemaForModel, impactForModel, replayWindow, withCacheBreakpoint } from './chat.compact';
import type { ChatTurn } from './claude.client';

describe('compactSchemaForModel', () => {
  it('drops the long uuid regex but keeps the uuid format and everything else', () => {
    const compact = compactSchemaForModel({
      $schema: 'x',
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', pattern: '^(long)$' },
        price: { type: 'string', pattern: '^\\d+$' },
      },
    });
    expect(compact).toEqual({
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid' }, price: { type: 'string', pattern: '^\\d+$' } },
    });
  });

  it('makes the tool definitions much smaller without changing what the server accepts', () => {
    const size = JSON.stringify(buildToolDefinitions()).length;
    expect(size).toBeLessThan(9000); // was 13,248 characters

    const id = '0192b6a0-1c2d-7e3f-8a4b-5c6d7e8f9a0b';
    const ok = chatToolSchemas.propose_changes.safeParse({
      operations: [{ op: 'SET_SELLING_PRICE', menuItemId: id, grossPrice: '12.5' }],
      summary: 'Raise the burger',
    });
    const bad = chatToolSchemas.propose_changes.safeParse({
      operations: [{ op: 'SET_SELLING_PRICE', menuItemId: 'not-a-uuid', grossPrice: '12.5' }],
      summary: 'x',
    });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });
});

describe('impactForModel', () => {
  const item = (n: number, delta: string): ImpactPreview['items'][number] => ({
    menuItemId: String(n),
    name: `Item ${n}`,
    gpPerPortionBefore: '1',
    gpPerPortionAfter: '2',
    gpPercentBefore: '10',
    gpPercentAfter: '20',
    deltaGpContribution: delta,
  });
  const summary = {} as ImpactPreview['summary'];

  it('leaves a small impact alone', () => {
    const impact = { summary, items: [item(1, '5'), item(2, '1')] };
    expect(impactForModel(impact)).toBe(impact);
  });

  it('keeps the items that moved most and says how many were left out', () => {
    const items = Array.from({ length: 12 }, (_, i) => item(i, String(i % 2 === 0 ? i : -i)));
    const shown = impactForModel({ summary, items });
    expect(shown.items).toHaveLength(8);
    expect(shown.moreItemsChanged).toBe(4);
    expect(shown.items.map((i) => i.name)).toContain('Item 11');
    expect(shown.items.map((i) => i.name)).not.toContain('Item 0');
  });
});

describe('replayWindow', () => {
  const msg = (role: string, n: number) => ({ role, n });
  const conversation = (messages: number) =>
    Array.from({ length: messages }, (_, i) => msg(i % 2 === 0 ? 'USER' : 'ASSISTANT', i));

  it('replays everything while the conversation is short', () => {
    expect(replayWindow(conversation(6), 12)).toHaveLength(6);
  });

  it('never starts on an assistant message', () => {
    // a failed request left an unanswered user message (index 3), which shifts the pairing so the
    // stepped start (index 4) lands on an assistant reply
    const roles = ['USER', 'ASSISTANT', 'USER', 'USER', 'ASSISTANT', 'USER', 'ASSISTANT', 'USER', 'ASSISTANT', 'USER', 'ASSISTANT', 'USER', 'ASSISTANT', 'USER'];
    const stored = roles.map((role, n) => msg(role, n));
    const replayed = replayWindow(stored, 12);
    expect(replayed[0].role).toBe('USER');
    expect(replayed[0].n).toBe(5);
    // a window that is only an assistant reply has nothing valid to start from
    expect(replayWindow([msg('ASSISTANT', 1), msg('ASSISTANT', 2)], 12)).toEqual([]);
  });

  it('moves its start in steps, so the replayed history is identical for several turns', () => {
    const counts = [14, 16, 18, 20, 22, 24, 26];
    const starts = counts.map((count) => replayWindow(conversation(count), 12)[0].n);
    // each turn adds two messages; the first replayed one changes only every second turn
    expect(starts).toEqual([4, 4, 8, 8, 12, 12, 16]);
    for (const count of counts) {
      const size = replayWindow(conversation(count), 12).length;
      expect(size).toBeLessThanOrEqual(12);
      expect(size).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('withCacheBreakpoint', () => {
  it('marks the last block of a plain user message, on a copy', () => {
    const original: ChatTurn[] = [{ role: 'user', content: 'hello' }];
    const marked = withCacheBreakpoint(original);
    expect(marked[0].content).toEqual([{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }]);
    expect(original[0].content).toBe('hello');
  });

  it('marks the last tool result and leaves earlier turns untouched', () => {
    const results = [
      { type: 'tool_result', tool_use_id: 'a', content: '{}' },
      { type: 'tool_result', tool_use_id: 'b', content: '{}' },
    ];
    const original = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'get_summary', input: {} }] },
      { role: 'user', content: results },
    ] as ChatTurn[];
    const marked = withCacheBreakpoint(original);
    const blocks = marked[2].content as unknown as Record<string, unknown>[];
    expect(blocks[0].cache_control).toBeUndefined();
    expect(blocks[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(marked[0]).toBe(original[0]);
    expect(JSON.stringify(original)).not.toContain('cache_control');
  });

  it('does nothing to an empty conversation', () => {
    expect(withCacheBreakpoint([])).toEqual([]);
  });
});

describe('buildSystemNote', () => {
  it('says nothing when nothing happened', () => {
    expect(buildSystemNote({ fromRevision: 3, toRevision: 3, changes: [], discarded: [] })).toBeNull();
  });

  it('reports applied changes and tells the assistant to look figures up again', () => {
    const note = buildSystemNote({ fromRevision: 3, toRevision: 5, changes: ['Classic Burger cost 3.20', 'House Fries price 4.50'], discarded: [] });
    expect(note).toContain('revision 3 to 5');
    expect(note).toContain('Classic Burger cost 3.20; House Fries price 4.50');
    expect(note).toContain('look them up again');
  });

  it('tells the assistant a proposal was turned down, so it does not offer it again', () => {
    const note = buildSystemNote({ fromRevision: 3, toRevision: 3, changes: [], discarded: ['Set House Fries cost to 1.10 EUR'] });
    expect(note).toContain('discarded a proposal');
    expect(note).toContain('Set House Fries cost to 1.10 EUR');
    expect(note).toContain('Nothing was changed');
    expect(note).not.toContain('revision');
  });

  it('can report both at once', () => {
    const note = buildSystemNote({ fromRevision: 1, toRevision: 2, changes: ['x'], discarded: ['y', 'z'] });
    expect(note).toContain('discarded proposals');
    expect(note?.startsWith('[System note')).toBe(true);
  });
});
