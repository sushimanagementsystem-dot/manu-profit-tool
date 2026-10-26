import { normalizeName } from '../normalization/names';
import { findBestMatch, MATCH_THRESHOLDS, similarity } from './similarity';

const score = (a: string, b: string) => similarity(normalizeName(a), normalizeName(b));

describe('similarity on real POS vs menu names', () => {
  it('scores a case difference as an exact match', () => {
    expect(score('CLASSIC BURGER', 'Classic Burger')).toBe(1);
  });

  it('auto-accepts word-order and plural differences', () => {
    expect(score('Burger Classic', 'Classic Burger')).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.auto);
    expect(score('House Fries', 'House Fry')).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.auto);
  });

  it('keeps a heavily abbreviated till name below the auto threshold', () => {
    expect(score('CHK BRGR DBL', 'Double Chicken Burger')).toBeLessThan(MATCH_THRESHOLDS.auto);
  });

  it('does not auto-accept two genuinely different dishes', () => {
    expect(score('Chicken Wings', 'Chicken Wrap')).toBeLessThan(MATCH_THRESHOLDS.auto);
    expect(score('Margherita Pizza', 'Pepperoni Pizza')).toBeLessThan(MATCH_THRESHOLDS.auto);
  });
});

describe('findBestMatch', () => {
  const candidates = [
    { id: 'burger', normalizedName: normalizeName('Classic Burger') },
    { id: 'salad', normalizedName: normalizeName('Chicken Caesar Salad') },
    { id: 'wings', normalizedName: normalizeName('Chicken Wings') },
  ];

  it('picks the closest candidate', () => {
    expect(findBestMatch(normalizeName('CLASSIC BURGER'), candidates)?.candidateId).toBe('burger');
    expect(findBestMatch(normalizeName('Caesar Salad Chicken'), candidates)?.candidateId).toBe('salad');
  });

  it('returns nothing when no candidate is close enough', () => {
    expect(findBestMatch(normalizeName('Sparkling Water 500ml'), candidates)).toBeNull();
  });

  it('distinguishes a size variant from the plain item', () => {
    const sized = [
      { id: 'plain', normalizedName: normalizeName('Chicken Wings') },
      { id: 'large', normalizedName: normalizeName('Chicken Wings Large') },
    ];
    expect(findBestMatch(normalizeName('Chicken Wings Large'), sized)?.candidateId).toBe('large');
  });
});

describe('normalizeName', () => {
  it('strips accents, punctuation, sizes and filler words', () => {
    expect(normalizeName('Crème Brûlée (Portion)')).toBe('creme brulee');
    expect(normalizeName('Beef Mince 6 x 2.5kg')).toBe('beef mince');
    // "and" is a stopword, so the ampersand disappears entirely.
    expect(normalizeName('Fish & Chips')).toBe('fish chip');
  });
});
