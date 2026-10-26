const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'with',
  'and',
  'fresh',
  'portion',
  'portions',
  'pcs',
  'pc',
  'x',
]);

/** Pack/size tokens such as "6x2.5kg", "500 g", "1L" — removed so they don't affect name matching. */
const SIZE_TOKEN = /\b\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:kg|g|gr|l|ltr|ml|cl|oz|lb|lbs)\b/g;

/**
 * Canonical form of an item or product name for matching and grouping:
 * accents folded, lowercase, sizes/punctuation/stopwords removed, simple plurals singularised.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(SIZE_TOKEN, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token && !STOPWORDS.has(token))
    .map(singularize)
    .join(' ');
}

function singularize(token: string): string {
  if (token.length <= 3 || /\d/.test(token)) return token;
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('oes')) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}
