/**
 * Client-side rhyme integration layer.
 *
 * Merges the instant suffix-based engine (src/rhyme.js) with async CMU
 * dictionary look-ups from the server.  The API is synchronous —
 * `getRhymeKey()` always returns immediately — but improves over time as
 * CMU data arrives and is cached.
 */

import { getSuffixRhymeKey, suffixRhyme, lastWordOf } from './rhyme.js';

// ── CMU cache ────────────────────────────────────────────────────────────────

const cmuCache = new Map();    // word → phoneme suffix string (or '' if not found)
const pendingWords = new Set(); // words queued for the next batch fetch
let fetchTimer = null;
let onCmuUpdate = null;         // callback to trigger re-render when new data arrives

/**
 * Register a callback that fires whenever CMU data arrives for new words.
 * The PoetryEditor component uses this to trigger a re-analysis.
 */
export function setCmuUpdateCallback(cb) {
  onCmuUpdate = cb;
}

/**
 * Queue words for CMU lookup.  Actually fetches after a short debounce
 * so that rapid typing batches into a single request.
 *
 * @param {string[]} words — raw words (will be normalised)
 */
export function prefetchRhymes(words) {
  let added = false;
  for (const raw of words) {
    const w = raw.toLowerCase().replace(/[^a-z]/g, '');
    if (!w || cmuCache.has(w) || pendingWords.has(w)) continue;
    pendingWords.add(w);
    added = true;
  }

  if (!added) return;

  // Debounce: collect for 300ms then fire a single batch
  if (fetchTimer) clearTimeout(fetchTimer);
  fetchTimer = setTimeout(flushPending, 300);
}

async function flushPending() {
  if (pendingWords.size === 0) return;
  const batch = [...pendingWords];
  pendingWords.clear();

  try {
    const url = `/api/rhyme?words=${encodeURIComponent(batch.join(','))}`;
    const res = await fetch(url);
    if (!res.ok) return;

    const data = await res.json();
    let hasNew = false;
    for (const [word, suffix] of Object.entries(data)) {
      if (!cmuCache.has(word)) hasNew = true;
      cmuCache.set(word, suffix ?? '');
    }
    if (hasNew && onCmuUpdate) onCmuUpdate();
  } catch {
    // Server unavailable — suffix engine still works
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get a rhyme key for a word.  Returns the suffix-based key immediately.
 * If CMU data is cached for this word, returns an object with both.
 *
 * @param {string} word
 * @returns {{ suffix: string|null, cmu: string|null }}
 */
export function getRhymeKey(word) {
  const suffix = getSuffixRhymeKey(word);
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  const cmu = cmuCache.get(w) || null;
  return { suffix, cmu };
}

/**
 * Do two words rhyme?  Returns true if EITHER the suffix engine or the
 * CMU layer (when available) considers them a match.
 */
export function wordsRhyme(a, b) {
  // Layer 1: suffix match
  if (suffixRhyme(a, b)) return true;

  // Layer 2: CMU match (if both words are cached)
  const wa = a.toLowerCase().replace(/[^a-z]/g, '');
  const wb = b.toLowerCase().replace(/[^a-z]/g, '');
  const ca = cmuCache.get(wa);
  const cb = cmuCache.get(wb);
  if (ca && cb && ca === cb) return true;

  return false;
}

// Re-export for convenience
export { lastWordOf } from './rhyme.js';
