/**
 * String similarity used for POS-name → menu-item matching. Both inputs are expected to be
 * normalised already (see normalizeName). Scores are in [0, 1].
 */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function ratio(a: string, b: string): number {
  const length = a.length + b.length;
  return length === 0 ? 1 : (length - levenshtein(a, b)) / length;
}

/**
 * Order-insensitive token comparison ("burger chicken" ≈ "chicken burger").
 *
 * Tokens only one side has are a real difference, not noise: "chicken wings" must not score
 * 1 against "chicken wings large", or a size variant would be auto-accepted as the plain
 * dish. So the shared-token score is scaled by how much of each name is shared.
 */
export function tokenSetRatio(a: string, b: string): number {
  const tokensA = new Set(a.split(' ').filter(Boolean));
  const tokensB = new Set(b.split(' ').filter(Boolean));
  if (!tokensA.size || !tokensB.size) return 0;

  const shared = [...tokensA].filter((token) => tokensB.has(token));
  if (!shared.length) return ratio(a, b);

  const sharedText = [...shared].sort().join(' ');
  const sortedA = [...tokensA].sort().join(' ');
  const sortedB = [...tokensB].sort().join(' ');
  // Jaccard over tokens: 1 only when both names carry exactly the same set.
  const coverage = shared.length / (tokensA.size + tokensB.size - shared.length);

  return Math.max(ratio(sortedA, sortedB), ratio(sharedText, sortedA) * coverage, ratio(sharedText, sortedB) * coverage);
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const matchedA = new Array<boolean>(a.length).fill(false);
  const matchedB = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - window); j < Math.min(b.length, i + window + 1); j++) {
      if (!matchedB[j] && a[i] === b[j]) {
        matchedA[i] = matchedB[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!matchedA[i]) continue;
    while (!matchedB[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;

  let prefix = 0;
  while (prefix < 4 && a[prefix] && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return Math.max(tokenSetRatio(a, b), jaroWinkler(a, b) * 0.97);
}

export const MATCH_THRESHOLDS = { auto: 0.92, suggest: 0.75 } as const;

export type MatchCandidate = { id: string; normalizedName: string };

export type BestMatch = { candidateId: string; score: number } | null;

/** Best candidate for a name, or null when nothing reaches the suggestion threshold. */
export function findBestMatch(name: string, candidates: MatchCandidate[]): BestMatch {
  let best: BestMatch = null;
  for (const candidate of candidates) {
    const score = similarity(name, candidate.normalizedName);
    if (!best || score > best.score) best = { candidateId: candidate.id, score };
  }
  return best && best.score >= MATCH_THRESHOLDS.suggest ? best : null;
}
