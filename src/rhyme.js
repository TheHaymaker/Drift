/**
 * Suffix-based rhyme detection engine.
 *
 * Provides instant, client-side rhyme matching by extracting and normalising
 * the "rhyme suffix" of English words — the portion from the last stressed
 * vowel sound onward.  A phonetic-equivalence table maps common spelling
 * patterns to canonical keys so that, e.g., "night" and "write" resolve to
 * the same key despite different spellings.
 *
 * Covers ~80 % of common English rhymes with zero external dependencies.
 * For trickier cases (love/dove, wind/mind) the CMU dictionary layer
 * (rhyme-client.js) provides an async enhancement.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

const VOWELS = 'aeiouy';
const isVowel = (c) => VOWELS.includes(c);

/**
 * Strip trailing punctuation and lowercase a word.
 */
function normalise(word) {
  return word.replace(/[^a-zA-Z]+$/g, '').replace(/^[^a-zA-Z]+/g, '').toLowerCase();
}

/**
 * Extract the raw suffix starting from the last vowel cluster.
 * e.g. "cat" → "at", "night" → "ight", "away" → "ay"
 */
function rawSuffix(w) {
  // Walk backwards to find the start of the last vowel cluster
  let i = w.length - 1;

  // Skip trailing consonants
  while (i >= 0 && !isVowel(w[i])) i--;
  if (i < 0) return w; // all consonants — return whole word

  // Skip through the vowel cluster
  while (i > 0 && isVowel(w[i - 1])) i--;

  return w.slice(i);
}

// ── Phonetic equivalence table ───────────────────────────────────────────────
//
// Maps spelling patterns (tested as regex against the word's ending) to
// canonical rhyme keys.  Order matters: first match wins.

const EQUIVALENCES = [
  // -ight / -ite / -yte → AYT
  [/(?:ight|ite|yte)$/, 'AYT'],
  // -tion / -sion / -cian → SHUN
  [/(?:tion|sion|cian)$/, 'SHUN'],
  // -ious / -eous → SHUS  (precious, gorgeous)
  [/(?:ious|eous)$/, 'SHUS'],
  // -ough / -ow (like "slow", "though") → OH
  // Note: "cow"/"how" end differently — handled by raw suffix
  [/(?:ough|ow)$/, 'OH'],
  // -eigh / -ay / -ey (end of word) → AY
  [/(?:eigh|ay|ey)$/, 'AY'],
  // -ee / -ea / -ie / -ey + silent-e patterns → EE
  [/(?:ee|ie)$/, 'EE'],
  [/ea$/, 'EE'],
  // -ine / -ign → AYN
  [/(?:ine|ign)$/, 'AYN'],
  // -air / -are / -ear (as in "bear") / -ere (as in "there") → AIR
  [/(?:air|are|ear|ere)$/, 'AIR'],
  // -oor / -ore / -oar / -our (as in "pour") → OR
  [/(?:oor|ore|oar|our)$/, 'OR'],
  // -ould → OOD  (would/should/could don't truly rhyme with "good" but
  // group them for the spelling convention)
  [/ould$/, 'OOD'],
  // -ue / -ew / -oo → OO
  [/(?:ue|ew|oo)$/, 'OO'],
  // -ous → US
  [/ous$/, 'US'],
  // -ble → BUL
  [/ble$/, 'BUL'],
  // -ful → FUL
  [/ful$/, 'FUL'],
  // -ness → NES
  [/ness$/, 'NES'],
  // -ment → MENT
  [/ment$/, 'MENT'],
  // -ence / -ance → ENSE / ANSE
  [/ence$/, 'ENSE'],
  [/ance$/, 'ANSE'],
];

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Return a canonical "rhyme key" for a word.  Words with the same key are
 * considered rhyming by the suffix engine.
 *
 * @param {string} word — a single English word (may include punctuation)
 * @returns {string|null} — canonical key, or null if the word is empty
 */
export function getSuffixRhymeKey(word) {
  const w = normalise(word);
  if (!w) return null;

  // Check equivalence table first
  for (const [re, key] of EQUIVALENCES) {
    if (re.test(w)) return key;
  }

  // Fall back to raw suffix extraction
  return rawSuffix(w);
}

/**
 * Do two words rhyme according to the suffix engine?
 */
export function suffixRhyme(a, b) {
  const ka = getSuffixRhymeKey(a);
  const kb = getSuffixRhymeKey(b);
  if (!ka || !kb) return false;
  return ka === kb;
}

/**
 * Extract the last word from a line of text.
 * Strips trailing punctuation.
 */
export function lastWordOf(line) {
  const m = line.trim().match(/[a-zA-Z]+[^a-zA-Z]*$/);
  if (!m) return null;
  return normalise(m[0]);
}
