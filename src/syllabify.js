import { syllable } from 'syllable';

const VOWELS = 'aeiouy';
const isVowel = (c) => VOWELS.includes(c.toLowerCase());

/**
 * Split a single word into its constituent syllable strings.
 * Uses the `syllable` package for an accurate count, then places
 * split-points at consonant-cluster midpoints between vowel nuclei.
 * Returns the original token if it contains no letters.
 */
export function syllabifyWord(token) {
  const letters = token.replace(/[^a-zA-Z]/g, '');
  if (!letters) return [token];

  const w = letters.toLowerCase();
  const targetCount = syllable(w);

  if (targetCount <= 1) return [token];

  // Find consonant-cluster boundaries between vowel groups
  const splitCandidates = [];
  let i = 0;

  while (i < w.length) {
    // skip to next vowel nucleus
    while (i < w.length && !isVowel(w[i])) i++;
    if (i >= w.length) break;
    // skip through vowel nucleus
    while (i < w.length && isVowel(w[i])) i++;
    const conStart = i;
    // skip through following consonant cluster
    while (i < w.length && !isVowel(w[i])) i++;
    const conEnd = i;

    if (conEnd < w.length && conEnd > conStart) {
      const numCons = conEnd - conStart;
      // V-C-V  → split before consonant (onset rule)
      // V-CC-V → split between consonants (coda + onset)
      const splitAt = numCons === 1 ? conStart : conStart + Math.floor(numCons / 2);
      splitCandidates.push(splitAt);
    }
  }

  // Use only as many splits as needed (targetCount - 1)
  const splits = splitCandidates.slice(0, targetCount - 1);
  if (splits.length === 0) return [token];

  // Build syllable strings from the letter-only form, then re-attach
  // non-letter prefix/suffix characters to the first/last syllable.
  const prefix = token.match(/^[^a-zA-Z]*/)?.[0] ?? '';
  const suffix = token.match(/[^a-zA-Z]*$/)?.[0] ?? '';
  const core = token.slice(prefix.length, token.length - suffix.length);
  const coreLetters = core.replace(/[^a-zA-Z]/g, '');

  const syllables = [];
  let prev = 0;
  for (const sp of splits) {
    syllables.push(coreLetters.slice(prev, sp));
    prev = sp;
  }
  syllables.push(coreLetters.slice(prev));

  // Re-attach decorative characters
  const result = syllables.filter(Boolean);
  if (result.length > 0) {
    result[0] = prefix + result[0];
    result[result.length - 1] = result[result.length - 1] + suffix;
  }
  return result.length > 0 ? result : [token];
}

/**
 * Count syllables in a single word token.
 */
export function countSyllables(token) {
  const letters = token.replace(/[^a-zA-Z]/g, '');
  if (!letters) return 0;
  return syllable(letters.toLowerCase());
}

/**
 * Tokenize a line into words and whitespace runs.
 * Each token has: { type: 'word'|'space', text, syllables?, count? }
 */
function tokenizeLine(line) {
  const parts = line.split(/(\s+)/);
  return parts
    .filter((p) => p.length > 0)
    .map((p) => {
      if (/^\s+$/.test(p)) {
        return { type: 'space', text: p };
      }
      const syls = syllabifyWord(p);
      const count = countSyllables(p);
      return { type: 'word', text: p, syllables: syls, count };
    });
}

/**
 * Analyze a full poem string into per-line data.
 * Returns an array of { tokens, syllableCount } — one entry per line.
 */
export function analyzeText(text) {
  return text.split('\n').map((line) => {
    const tokens = tokenizeLine(line);
    const syllableCount = tokens.reduce((s, t) => s + (t.count ?? 0), 0);
    return { tokens, syllableCount };
  });
}

/** Built-in poetry forms. Extend as needed. */
export const POETRY_FORMS = {
  haiku: {
    name: 'Haiku',
    description: '5 — 7 — 5',
    pattern: [5, 7, 5],
  },
};
