import type { ImpactPreview } from '../revisions/impact';
import type { ChatTurn } from './claude.client';

/**
 * Pure helpers that keep the assistant's requests small and valid. Nothing here talks to the
 * model or the database, so each one is unit-tested (chat.compact.spec.ts).
 */

type JsonSchema = Record<string, unknown>;

/**
 * The schema the model sees, not the one the server validates with. A zod `uuid()` is emitted with
 * a ~150-character regex, and the operations schema has about fifteen uuid fields (twice, once per
 * tool); the model only needs to know it is a uuid. The server still validates every call against the
 * full zod schema, so a malformed id is rejected exactly as before.
 */
export function compactSchemaForModel<T>(schema: T): T {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;
    const source = node as JsonSchema;
    const result: JsonSchema = {};
    for (const [key, value] of Object.entries(source)) {
      if (key === '$schema') continue;
      if (key === 'pattern' && source.format === 'uuid') continue;
      result[key] = walk(value);
    }
    return result;
  };
  return walk(schema) as T;
}

/** The items shown to the model for a change: the ones that moved most, plus how many were left out. */
const IMPACT_ITEMS_FOR_MODEL = 8;

export function impactForModel(impact: ImpactPreview): ImpactPreview & { moreItemsChanged?: number } {
  if (impact.items.length <= IMPACT_ITEMS_FOR_MODEL) return impact;
  const size = (item: ImpactPreview['items'][number]) => Math.abs(Number(item.deltaGpContribution ?? 0));
  const items = [...impact.items].sort((a, b) => size(b) - size(a)).slice(0, IMPACT_ITEMS_FOR_MODEL);
  return { ...impact, items, moreItemsChanged: impact.items.length - items.length };
}

/**
 * What happened to the analysis since the assistant last replied, in one line for the next user
 * message: changes that were applied (by the owner in the table or by confirming a proposal) and
 * proposals the owner discarded. Without it the assistant goes on quoting old figures, or offers
 * a change the owner already turned down. Null when there is nothing to say.
 */
export function buildSystemNote(args: {
  fromRevision: number;
  toRevision: number;
  changes: string[];
  discarded: string[];
}): string | null {
  const parts: string[] = [];
  if (args.toRevision > args.fromRevision) {
    parts.push(
      `the analysis changed (revision ${args.fromRevision} to ${args.toRevision})` +
        (args.changes.length ? `. Changes: ${args.changes.slice(0, 20).join('; ')}` : '') +
        '. Figures you quoted earlier may be out of date; look them up again with your tools before answering',
    );
  }
  if (args.discarded.length) {
    parts.push(
      `the owner discarded ${args.discarded.length === 1 ? 'a proposal' : 'proposals'} you prepared (${args.discarded.slice(0, 5).join('; ')}). ` +
        'Nothing was changed; do not offer or count on it again unless they ask',
    );
  }
  return parts.length ? `[System note, not from the user: since your last reply, ${parts.join('. Also, ')}.]` : null;
}

/** Messages dropped at a time when the window moves, so the replayed history stays the same for a few turns. */
const WINDOW_STEP = 4;

/**
 * The stored messages to replay: at most `limit` of the newest, starting at a user message.
 *
 * A window that slid by one exchange every turn would change the very first replayed message each
 * time, and the prompt cache matches from the start, so nothing after it would ever be a cache hit.
 * The start therefore moves in steps of WINDOW_STEP messages: the history is byte-identical for
 * the turns in between and is read from the cache at a tenth of the price. (The window holds
 * between `limit - WINDOW_STEP` and `limit` messages.)
 *
 * It also never starts on an assistant message, which the API rejects as a first turn; that can
 * happen when a failed request leaves a user message with no reply and shifts the pairing.
 */
export function replayWindow<T extends { role: string }>(stored: T[], limit: number): T[] {
  const start = stored.length > limit ? Math.ceil((stored.length - limit) / WINDOW_STEP) * WINDOW_STEP : 0;
  const window = stored.slice(start);
  const firstUser = window.findIndex((message) => message.role === 'USER');
  return firstUser === -1 ? [] : window.slice(firstUser);
}

/**
 * A copy of the conversation with a cache breakpoint on its last block, so everything before it,
 * the earlier turns and the tool results already gathered in this request, is read from the prompt
 * cache at a tenth of the price on the next call instead of being paid for in full again. The
 * copy matters: the stored turns must never carry the marker, because only four are allowed per
 * request and a stored one would go stale.
 */
export function withCacheBreakpoint(messages: ChatTurn[]): ChatTurn[] {
  if (!messages.length) return messages;
  const last = messages[messages.length - 1];
  const blocks: Record<string, unknown>[] =
    typeof last.content === 'string'
      ? [{ type: 'text', text: last.content }]
      : [...(last.content as unknown as Record<string, unknown>[])];
  const tail = blocks[blocks.length - 1];
  // Thinking blocks cannot carry a marker; the last block of a user turn never is one.
  if (!tail || tail.type === 'thinking' || tail.type === 'redacted_thinking') return messages;
  blocks[blocks.length - 1] = { ...tail, cache_control: { type: 'ephemeral' } };
  return [...messages.slice(0, -1), { ...last, content: blocks } as unknown as ChatTurn];
}
