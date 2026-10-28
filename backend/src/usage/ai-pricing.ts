/**
 * List prices in US dollars per million tokens, as Anthropic bills them. Only models whose price
 * is known are listed: an unlisted model has no price here, and the cost is then reported as
 * unknown rather than guessed. Check https://www.anthropic.com/pricing before trusting a figure
 * for a model added here, and update this table when a price changes.
 */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
};

/** Prompt caching: writing a prefix costs 25 % more than reading it as plain input, reading it 90 % less. */
export const CACHE_WRITE_MULTIPLIER = 1.25;
export const CACHE_READ_MULTIPLIER = 0.1;

/**
 * Model ids come back with a date suffix when a snapshot is pinned (`claude-sonnet-5-5-20261001`);
 * the price is the family's.
 */
export function priceFor(
  model: string,
): { input: number; output: number } | null {
  if (MODEL_PRICES[model]) return MODEL_PRICES[model];
  const family = Object.keys(MODEL_PRICES)
    .sort((a, b) => b.length - a.length)
    .find((known) => model.startsWith(`${known}-`));
  return family ? MODEL_PRICES[family] : null;
}
