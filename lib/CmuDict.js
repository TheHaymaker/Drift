/**
 * CMU Pronouncing Dictionary helper.
 *
 * Loads the dictionary once at require-time and provides a function to
 * extract the "rhyme suffix" — the phonemes from the last stressed vowel
 * onward — for any word in the dictionary.
 */

const { dictionary } = require('cmu-pronouncing-dictionary');

/**
 * Return the rhyme suffix (phonemes from the last primary-stressed vowel
 * onward) for a word, or null if the word isn't in the dictionary.
 *
 * Example: "night" → "AY1 T", "toast" → "OW1 S T"
 *
 * @param {string} word
 * @returns {string|null}
 */
function getRhymeSuffix(word) {
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  const phones = dictionary[w];
  if (!phones) return null;

  // Phoneme string like "N AY1 T" — split into tokens
  const parts = phones.split(' ');

  // Walk backwards to find the last stressed vowel (contains '1' or '2')
  let idx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/[12]/.test(parts[i])) {
      idx = i;
      break;
    }
  }

  // If no stress mark found, try any vowel (has a digit)
  if (idx === -1) {
    for (let i = parts.length - 1; i >= 0; i--) {
      if (/\d/.test(parts[i])) {
        idx = i;
        break;
      }
    }
  }

  if (idx === -1) return null;

  return parts.slice(idx).join(' ');
}

module.exports = { getRhymeSuffix };
