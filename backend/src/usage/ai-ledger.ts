import { Decimal, ZERO } from '../common/decimal';
import {
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  priceFor,
} from './ai-pricing';

export type Tokens = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  calls: number;
};
export type AiLedger = {
  /** Reading the uploaded PDFs and photos (n8n), by the model that did it. */
  extraction: Record<string, Tokens>;
  /** The assistant chat, by the model that answered. */
  chat: Record<string, Tokens>;
};

export const emptyLedger = (): AiLedger => ({ extraction: {}, chat: {} });

const emptyTokens = (): Tokens => ({
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
  calls: 0,
});

/** Reads the ledger out of a job's `aiUsage` JSON, which may predate it or be empty. */
export function ledgerOf(aiUsage: unknown): AiLedger {
  const ledger = (aiUsage as { ledger?: Partial<AiLedger> } | null)?.ledger;
  return {
    extraction: { ...(ledger?.extraction ?? {}) },
    chat: { ...(ledger?.chat ?? {}) },
  };
}

/** Adds one model call to the ledger. Returns a new ledger; the argument is left alone. */
export function addCall(
  ledger: AiLedger,
  kind: keyof AiLedger,
  model: string,
  call: Partial<Omit<Tokens, 'calls'>>,
): AiLedger {
  const before = ledger[kind][model] ?? emptyTokens();
  const after: Tokens = {
    input: before.input + (call.input ?? 0),
    output: before.output + (call.output ?? 0),
    cacheWrite: before.cacheWrite + (call.cacheWrite ?? 0),
    cacheRead: before.cacheRead + (call.cacheRead ?? 0),
    calls: before.calls + 1,
  };
  return { ...ledger, [kind]: { ...ledger[kind], [model]: after } };
}

export type UsagePart = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** US dollars, or null when any model involved has no known price. */
  costUsd: string | null;
};

export type UsageSummary = {
  extraction: UsagePart;
  chat: UsagePart;
  totalUsd: string | null;
};

const PLACES = 4;

function costOf(tokens: Tokens, model: string): Decimal | null {
  const price = priceFor(model);
  if (!price) return null;
  const inputPerToken = new Decimal(price.input).dividedBy(1_000_000);
  const outputPerToken = new Decimal(price.output).dividedBy(1_000_000);
  return inputPerToken
    .times(tokens.input)
    .plus(outputPerToken.times(tokens.output))
    .plus(inputPerToken.times(CACHE_WRITE_MULTIPLIER).times(tokens.cacheWrite))
    .plus(inputPerToken.times(CACHE_READ_MULTIPLIER).times(tokens.cacheRead));
}

function summarizePart(part: Record<string, Tokens>): {
  summary: UsagePart;
  cost: Decimal | null;
} {
  let cost: Decimal | null = ZERO;
  const summary: UsagePart = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: null,
  };
  for (const [model, tokens] of Object.entries(part)) {
    summary.calls += tokens.calls;
    summary.inputTokens += tokens.input + tokens.cacheWrite + tokens.cacheRead;
    summary.outputTokens += tokens.output;
    const modelCost = costOf(tokens, model);
    cost = cost && modelCost ? cost.plus(modelCost) : null;
  }
  summary.costUsd = cost
    ? cost.toDecimalPlaces(PLACES, Decimal.ROUND_HALF_UP).toFixed(PLACES)
    : null;
  return { summary, cost };
}

/** What a job's AI calls cost at list prices, split into reading the files and the chat. */
export function summarize(ledger: AiLedger): UsageSummary {
  const extraction = summarizePart(ledger.extraction);
  const chat = summarizePart(ledger.chat);
  const total =
    extraction.cost && chat.cost ? extraction.cost.plus(chat.cost) : null;
  return {
    extraction: extraction.summary,
    chat: chat.summary,
    totalUsd: total
      ? total.toDecimalPlaces(PLACES, Decimal.ROUND_HALF_UP).toFixed(PLACES)
      : null,
  };
}
