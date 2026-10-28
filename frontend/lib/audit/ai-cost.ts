/**
 * An AI cost in US dollars, the currency Anthropic bills in. A single analysis costs cents, and
 * rounding that to two decimals would turn $0.004 into $0.00, so small amounts keep three.
 * A cost the server could not price is said to be unknown, never shown as zero.
 */
export function formatUsd(costUsd: string | null | undefined): string {
  if (costUsd === null || costUsd === undefined) return "not priced";
  const amount = Number(costUsd);
  if (!Number.isFinite(amount)) return "not priced";
  return `$${amount.toFixed(amount < 1 ? 3 : 2)}`;
}

/** "3 calls" / "1 call" / "none yet". */
export function formatCalls(calls: number): string {
  if (calls === 0) return "none yet";
  return `${calls} ${calls === 1 ? "call" : "calls"}`;
}
