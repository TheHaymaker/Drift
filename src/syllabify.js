import { syllable } from 'syllable';
import { getRhymeKey, wordsRhyme, lastWordOf, prefetchRhymes } from './rhyme-client.js';

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

// ── Rhyme scheme evaluation ──────────────────────────────────────────────────

/**
 * For a couplet scheme, dynamically assign rhyme groups: AA BB CC …
 */
function coupletScheme(lineCount) {
  const letters = [];
  let code = 0;
  for (let i = 0; i < lineCount; i++) {
    letters.push(String.fromCharCode(65 + code)); // 'A', 'B', …
    if (i % 2 === 1) code++;
  }
  return letters;
}

/**
 * Evaluate how the poem's actual rhymes compare to the expected scheme.
 *
 * @param {Array} lines — per-line analysis objects (need lastWord, rhymeKey)
 * @param {string[]|string} scheme — rhyme scheme array or 'couplet'
 * @returns {Array<{ expected: string, status: string, matchedWith: number[] }>}
 */
export function evaluateRhymeScheme(lines, scheme) {
  const letters = scheme === 'couplet'
    ? coupletScheme(lines.length)
    : scheme;

  const result = [];

  for (let i = 0; i < letters.length; i++) {
    const expected = letters[i];
    const lineData = lines[i];
    const lastWord = lineData?.lastWord;

    if (!lastWord || !lineData) {
      result.push({ expected, status: 'pending', matchedWith: [] });
      continue;
    }

    // Find all other lines with the same expected group that have content
    const sameGroup = [];
    for (let j = 0; j < letters.length; j++) {
      if (j === i || letters[j] !== expected) continue;
      if (lines[j]?.lastWord) sameGroup.push(j);
    }

    if (sameGroup.length === 0) {
      // Only one line in this group written so far — pending
      result.push({ expected, status: 'pending', matchedWith: [] });
      continue;
    }

    // Check if this line rhymes with any other in the same group
    const matchedWith = [];
    for (const j of sameGroup) {
      if (wordsRhyme(lastWord, lines[j].lastWord)) {
        matchedWith.push(j);
      }
    }

    const status = matchedWith.length > 0 ? 'match' : 'miss';
    result.push({ expected, status, matchedWith });
  }

  return result;
}

// ── Main analysis function ───────────────────────────────────────────────────

/**
 * Analyze a full poem string into per-line data with optional rhyme evaluation.
 *
 * @param {string} text — the full poem text
 * @param {object} [form] — a POETRY_FORMS entry (optional)
 * @returns {{ lines: Array, rhymeGroups: Array|null }}
 */
export function analyzeText(text, form) {
  const lines = text.split('\n').map((line) => {
    const tokens = tokenizeLine(line);
    const syllableCount = tokens.reduce((s, t) => s + (t.count ?? 0), 0);
    const lastWord = lastWordOf(line);
    const rhymeKey = lastWord ? getRhymeKey(lastWord) : null;
    return { tokens, syllableCount, lastWord, rhymeKey };
  });

  // Trigger async CMU prefetch for all last words
  const wordsToFetch = lines.map((l) => l.lastWord).filter(Boolean);
  if (wordsToFetch.length > 0) prefetchRhymes(wordsToFetch);

  // Evaluate rhyme scheme if the form defines one
  const rhymeGroups = form?.rhymeScheme
    ? evaluateRhymeScheme(lines, form.rhymeScheme)
    : null;

  return { lines, rhymeGroups };
}

// ── Poetry forms registry ────────────────────────────────────────────────────

export { POETRY_FORMS, FORM_CATEGORIES } from './poeticFormsData.js';
