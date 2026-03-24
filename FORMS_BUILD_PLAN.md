# Poetic Forms Database — Chunked Build Plan

This file describes how to build `src/poeticFormsData.js` in **6 phases**.
Each phase can be executed independently by a sub-agent or fresh session.

## Architecture

**Target file:** `src/poeticFormsData.js`
**Export:** `export const POETRY_FORMS = { ... }` and `export const FORM_CATEGORIES = [ ... ]`

### Data Shape Per Form

```js
{
  // Backward-compatible fields (must match existing syllabify.js shape)
  name: 'Form Name',
  description: 'Short display string for dropdown',
  pattern: [5, 7, 5] | null,        // syllable counts per line, null if variable
  rhymeScheme: ['A','B','A','B'] | 'couplet' | null,
  lineCount: 14 | null,             // fixed line count or null
  stanzas: [4, 4, 4, 2] | null,     // stanza grouping or null

  // New fields
  category: 'east-asian',           // category key (see FORM_CATEGORIES)
  origin: 'Japan',
  validationLevel: 'full' | 'partial' | 'none',
  summary: '1-2 sentence overview',
  history: '2-3 sentence history',
  ethos: 'What this form values / its spirit',
  tips: ['Writing tip 1', 'Writing tip 2'],
  constraints: ['Display-only constraint 1'],  // rules engine can't validate
  notablePoets: ['Poet 1', 'Poet 2'],
  exampleTitle: 'Famous example poem title',
}
```

### Category Registry

```js
export const FORM_CATEGORIES = [
  { key: 'east-asian',      label: 'East & Southeast Asian' },
  { key: 'european',        label: 'European & Western' },
  { key: 'middle-eastern',  label: 'Middle Eastern & Islamic' },
  { key: 'african',         label: 'African Traditions' },
  { key: 'celtic',          label: 'Celtic & British Isles' },
  { key: 'modern',          label: 'Modern & Invented' },
  { key: 'open',            label: 'Open Forms' },
];
```

---

## Phase 1: File Scaffold + East & Southeast Asian (12 forms)

**Instructions:** Create `src/poeticFormsData.js`. Write the file header with FORM_CATEGORIES export, then add these 12 forms to POETRY_FORMS:

| Key | Name | Pattern | Rhyme | Lines | Stanzas |
|-----|------|---------|-------|-------|---------|
| `haiku` | Haiku | `[5,7,5]` | `null` | `3` | `null` |
| `tanka` | Tanka | `[5,7,5,7,7]` | `null` | `5` | `null` |
| `senryu` | Senryu | `[5,7,5]` | `null` | `3` | `null` |
| `katauta` | Katauta | `[5,7,7]` | `null` | `3` | `null` |
| `sedoka` | Sedoka | `[5,7,7,5,7,7]` | `null` | `6` | `[3,3]` |
| `choka` | Chōka | `null` (alternating 5-7, ends 5-7-7) | `null` | `null` | `null` |
| `dodoitsu` | Dodoitsu | `[7,7,7,5]` | `null` | `4` | `null` |
| `sijo` | Sijo | `[15,15,15]` (approx 14-16 each) | `null` | `3` | `null` |
| `lucBat` | Lục Bát | `null` (alternating 6-8) | `null` | `null` | `null` |
| `pantun` | Pantun | `null` | `['A','B','A','B']` | `4` | `null` |
| `tanaga` | Tanaga | `[7,7,7,7]` | `['A','A','B','B']` | `4` | `null` |
| `americanCinquain` | American Cinquain | `[2,4,6,8,2]` | `null` | `5` | `null` |

**Validation levels:** haiku/tanka/senryu/katauta/sedoka/dodoitsu/sijo/pantun/tanaga/americanCinquain = `'full'`; choka/lucBat = `'partial'`

**Cultural details to include:**
- Haiku: Matsuo Bashō, kireji cutting word, kigo seasonal reference, Zen Buddhism roots
- Tanka: Oldest Japanese form (7th c.), Man'yōshū, kami-no-ku/shimo-no-ku pivot
- Senryu: Karai Senryū, satirical/human nature, no kigo needed unlike haiku
- Katauta: "Half-poem" designed for call-and-response, origin of sedoka
- Sedoka: Question-and-answer structure, two katauta joined
- Chōka: Court poetry, longest Japanese form, often followed by hanka (envoi tanka)
- Dodoitsu: Edo-period folk song form, themes of love/humor
- Sijo: Korean, 600+ year history, thematic twist in final line, Yi Dynasty courts
- Lục Bát: Vietnamese national verse, interlocking 6-8 syllable lines, tonal rules
- Pantun: Malay/Indonesian, pembayang (shadow lines 1-2) + maksud (meaning lines 3-4)
- Tanaga: Pre-colonial Filipino, 7-syllable quatrain, riddle-like wisdom
- American Cinquain: Adelaide Crapsey (1914), inspired by Japanese forms, captures stillness

**End state:** File exports FORM_CATEGORIES array and begins POETRY_FORMS with 12 East Asian forms. Leave the object open for next phase to append.

Actually, to avoid merge complexity: **each phase writes the COMPLETE file** with all forms added so far plus the new batch. Phase 1 exports 12 forms, Phase 2 overwrites with 12+17=29 forms, etc.

**Simpler approach:** Each phase uses the Edit tool to INSERT its batch of forms into the existing POETRY_FORMS object, just before the closing `};`.

---

## Phase 2: European & Western (16 forms)

**Instructions:** Edit `src/poeticFormsData.js`, inserting these 16 forms after the East Asian forms:

| Key | Name | Pattern | Rhyme | Lines | Stanzas |
|-----|------|---------|-------|-------|---------|
| `sonnetPetrarchan` | Petrarchan Sonnet | `[10x14]` | `['A','B','B','A','A','B','B','A','C','D','E','C','D','E']` | `14` | `[8,6]` |
| `sonnet` | Shakespearean Sonnet | `[10x14]` | `['A','B','A','B','C','D','C','D','E','F','E','F','G','G']` | `14` | `[4,4,4,2]` |
| `sonnetSpenserian` | Spenserian Sonnet | `[10x14]` | `['A','B','A','B','B','C','B','C','C','D','C','D','E','E']` | `14` | `[4,4,4,2]` |
| `villanelle` | Villanelle | `[10x19]` | `['A','B','A','A','B','A','A','B','A','A','B','A','A','B','A','A','B','A','A']` | `19` | `[3,3,3,3,3,4]` |
| `sestina` | Sestina | `null` | `null` | `39` | `[6,6,6,6,6,6,3]` |
| `triolet` | Triolet | `[8x8]` (approx) | `['A','B','A','A','A','B','A','B']` | `8` | `null` |
| `pantoum` | Pantoum | `null` | `null` | `null` | `null` |
| `limerick` | Limerick | `[8,8,5,5,8]` | `['A','A','B','B','A']` | `5` | `null` |
| `clerihew` | Clerihew | `null` | `['A','A','B','B']` | `4` | `null` |
| `ballad` | Ballad | `[8,6,8,6]` | `['A','B','C','B']` | `4` | `null` |
| `rondeau` | Rondeau | `[8x15]` (approx) | `['A','A','B','B','A','A','A','B','R','A','A','B','B','A','R']` | `15` | `[5,4,6]` |
| `terzaRima` | Terza Rima | `null` (10 syl/line) | `null` (ABA BCB CDC interlocking) | `null` | `null` |
| `heroicCouplet` | Heroic Couplet | `null` (10 syl/line) | `'couplet'` | `null` | `null` |
| `blankVerse` | Blank Verse | `null` (10 syl/line) | `null` | `null` | `null` |
| `ballade` | Ballade | `[8x31]` (approx) | complex 28+3 line scheme | `31` | `[8,8,8,4]` |
| `kyrielle` | Kyrielle | `[8,8,8,8]` | `['A','A','B','B']` | `null` (repeating stanzas) | `null` |

**Note on `[10x14]`:** This means `Array(14).fill(10)` — write it out as the full array in code.

**Cultural details to include:**
- Petrarchan: Francesco Petrarca (14th c.), volta at line 9, octave states/sestet resolves
- Shakespearean: 3 quatrains develop + couplet resolves, English Renaissance
- Spenserian: Edmund Spenser, interlocking rhyme bridges stanzas
- Villanelle: French, two refrains (L1 & L3 repeat), obsessive/circular. Dylan Thomas "Do Not Go Gentle"
- Sestina: Troubadour Arnaut Daniel, lexical rotation of 6 end-words, order: 615243
- Triolet: Medieval French, lines 1/4/7 identical, lines 2/8 identical
- Pantoum: Malaysian origin via French, lines 2&4 become 1&3 of next stanza
- Limerick: Edward Lear, anapestic, humorous, Limerick Ireland
- Clerihew: Edmund Clerihew Bentley, first line = person's name, comic biography
- Ballad: Oral tradition, storytelling, common meter (hymn meter)
- Rondeau: 15th c. French, rentrement (refrain from opening phrase)
- Terza Rima: Dante's Divine Comedy, interlocking chain rhyme
- Heroic Couplet: Pope, Dryden, neoclassical, iambic pentameter pairs
- Blank Verse: Shakespeare/Milton, unrhymed iambic pentameter
- Ballade: Not ballad — Villon, 3 octaves + envoi, same refrain closes each
- Kyrielle: French prayer form, refrain at end of each quatrain

---

## Phase 3: Middle Eastern & Islamic (5 forms)

| Key | Name | Pattern | Rhyme | Lines | Stanzas |
|-----|------|---------|-------|-------|---------|
| `ghazal` | Ghazal | `null` | `null` (AA BA CA DA — custom) | `null` (5-15 couplets) | `null` |
| `qasida` | Qasida | `null` | `null` (monorhyme AA AA AA) | `null` | `null` |
| `rubaiyat` | Rubáiyát | `null` | `['A','A','B','A']` | `4` | `null` |
| `masnavi` | Masnavi | `null` | `'couplet'` | `null` | `null` |
| `interlockingRubaiyat` | Interlocking Rubáiyát | `null` | `['A','A','B','A']` | `null` (chains of quatrains) | `null` |

**Cultural details:**
- Ghazal: Arabic origin (7th c.), matla (opening couplet both lines rhyme), qafiya (rhyme word) + radif (refrain after rhyme), maqta (final couplet with poet's takhallus/pen name). Each couplet self-contained. Hafiz, Rumi, Ghalib, Agha Shahid Ali
- Qasida: Pre-Islamic Arabic, can reach 100+ couplets, 3 sections: nasib (love prelude), rahil (desert journey), panegyric (praise). Al-Mutanabbi, Imru' al-Qais
- Rubáiyát: Omar Khayyam → Edward FitzGerald's translation, AABA scheme, philosophical/wine/transience. Interlocking: 3rd line provides next stanza's rhyme
- Masnavi: Rumi's Masnavi-ye-Ma'navi (26,000 couplets), epic/didactic narrative, AA BB CC each couplet independent rhyme
- Interlocking Rubáiyát: Chain variant where unrhymed 3rd line becomes the rhyme-sound of the next stanza

---

## Phase 4: African Traditions (8 forms)

| Key | Name | Pattern | Rhyme | Lines | Stanzas |
|-----|------|---------|-------|-------|---------|
| `izibongo` | Praise Poem (Izibongo) | `null` | `null` | `null` | `null` |
| `oriki` | Oriki | `null` | `null` | `null` | `null` |
| `gabay` | Gabay | `null` (approx 15 syl/line) | `null` | `null` | `null` |
| `geeraar` | Geeraar | `null` (7 syl/line) | `null` | `null` | `null` |
| `buraanbur` | Buraanbur | `null` (10 syl/line) | `null` | `null` | `null` |
| `belwo` | Belwo | `null` | `null` | `null` | `null` |
| `elegy` | Elegy | `null` | `null` | `null` | `null` |
| `negritude` | Négritude Verse | `null` | `null` | `null` | `null` |

**All validation levels: `'none'` except gabay/geeraar/buraanbur = `'partial'`**

**Cultural details:**
- Izibongo: Zulu/Xhosa praise poetry, imbongi (praise poet) performs at ceremonies, praise names (izithakazelo), parallelism, metaphor. Oral performance tradition
- Oriki: Yoruba praise poetry, chanted epithets/attributes of a person/deity/place, accumulative structure, performed by women at ceremonies
- Gabay: Somali — most prestigious form, serious/philosophical, mandatory alliteration (xarafraac) with single letter throughout, 14-16 syllables or 20-21 vowel mora per line, quantitative meter (miisaan). Sayyid Mohamed Abdullah Hassan
- Geeraar: Somali — shorter/lighter form, 7 syllables/line, alliterative, traditionally about warfare/horses/pastoral life
- Buraanbur: Somali women's form, 10 syllables/line, alliterative (xarafraac), performed at weddings/births/celebrations, emotional/personal
- Belwo: Modern Somali (1920s+), short romantic love poetry, began as "miniature" form, Abdi Deeqsi pioneer
- Elegy: Universal lament form, solemn/meditative, honoring the dead. Milton's "Lycidas", Gray's "Elegy Written in a Country Churchyard", Whitman's "O Captain"
- Négritude: Aimé Césaire/Léopold Sédar Senghor/Léon-Gontran Damas (1930s Paris), rhythmic/somatic, natural imagery, reclaiming African identity, anticolonial. Free-form but highly musical

---

## Phase 5: Celtic & British Isles (5 forms)

| Key | Name | Pattern | Rhyme | Lines | Stanzas |
|-----|------|---------|-------|-------|---------|
| `cynghanedd` | Cynghanedd | `null` | `null` | `null` | `null` |
| `englyn` | Englyn | `[10,6,7,7]` | `null` | `4` | `null` |
| `cywydd` | Cywydd | `null` (7 syl/line) | `'couplet'` | `null` | `null` |
| `alliterativeVerse` | Old English Alliterative Verse | `null` | `null` | `null` | `null` |
| `aeFreislighe` | Ae Freislighe | `[7,7,7,7]` | `['A','B','A','B']` | `4` | `null` |

**Cultural details:**
- Cynghanedd: Welsh "harmony" — 4 types: Groes (consonant repetition across caesura), Draws (partial), Lusg (internal rhyme), Sain (rhyme+alliteration). Required in englyn and awdl. Bardic tradition, Eisteddfod competitions
- Englyn: Welsh short form, Englyn Unodl Union = 30 syllables (10-6-7-7), gwant (pause in line 1) + cyrch (trailing section), requires cynghanedd in every line
- Cywydd: Welsh, Dafydd ap Gwilym (14th c.), 7-syllable rhyming couplets, one stressed + one unstressed ending per couplet
- Old English Alliterative Verse: Beowulf, 2 half-lines (hemistichs) per line joined by alliteration, caesura between, 4 stresses per line. Anglo-Saxon oral tradition
- Ae Freislighe: Irish, 7 syllables/line, alternating triple/double end-rhymes, final word/syllable must echo the opening. Bardic schools tradition

---

## Phase 6: Modern & Invented (10 forms) + Open Forms (2 forms)

| Key | Name | Pattern | Rhyme | Lines | Stanzas |
|-----|------|---------|-------|-------|---------|
| `paradelle` | Paradelle | `null` | `null` | `24` | `[6,6,6,6]` |
| `doubleDactyl` | Double Dactyl | `null` | `null` | `8` | `[4,4]` |
| `rubliw` | Rubliw | `[2,4,6,8,10,8,6,4,2]` | `null` | `9` | `null` |
| `fib` | Fib | `[1,1,2,3,5,8]` | `null` | `6` | `null` |
| `quatern` | Quatern | `Array(16).fill(8)` | `null` | `16` | `[4,4,4,4]` |
| `goldenShovel` | Golden Shovel | `null` | `null` | `null` | `null` |
| `erasure` | Erasure Poetry | `null` | `null` | `null` | `null` |
| `concretPoem` | Concrete Poem | `null` | `null` | `null` | `null` |
| `prosePoom` | Prose Poem | `null` | `null` | `null` | `null` |
| `nonet` | Nonet | `[9,8,7,6,5,4,3,2,1]` | `null` | `9` | `null` |
| `freeVerse` | Free Verse | `null` | `null` | `null` | `null` |
| `couplet` | Couplet | `null` | `'couplet'` | `null` | `null` |

**Cultural details:**
- Paradelle: Billy Collins (1998), started as hoax/parody of villanelle, 4 sestets with strict word-repetition rules. Has since been written seriously
- Double Dactyl: Anthony Hecht & Paul Pascal (1966), aka "Higgledy-Piggledy," dactylic dimeter, line 1 = nonsense, line 2 = proper name, one line must be a single double-dactylic word
- Rubliw: Richard Wilbur, diamond shape (1-2-3-4-5-4-3-2-1 iambic feet = 2-4-6-8-10-8-6-4-2 syllables)
- Fib: Greg Pincus (2006), Fibonacci sequence syllable counts, blog-born form
- Quatern: French, refrain line rotates position across 4 quatrains (line 1 in stanza 1, line 2 in stanza 2, etc.)
- Golden Shovel: Terrance Hayes (2010), end-words spell out a line from another poet's work. Named for Gwendolyn Brooks' "We Real Cool"
- Erasure: Found poetry via deletion/redaction, Tom Phillips' "A Humument"
- Concrete: Visual/shape poetry, George Herbert "Easter Wings," Brazilian Concretismo
- Prose Poem: Baudelaire, paragraph form with poetic intensity, no line breaks
- Nonet: 9 lines descending 9-8-7-6-5-4-3-2-1 syllables, modern form
- Free Verse: Walt Whitman, no fixed constraints, organic form
- Couplet: Universal, AA BB CC rhyming pairs

---

## Post-Database Phases (separate from data file)

### Phase 7: Update syllabify.js
- Change `POETRY_FORMS` import source from inline to `./poeticFormsData.js`
- Remove inline POETRY_FORMS definition
- `analyzeText()` continues unchanged — it only reads `pattern`, `rhymeScheme`, `lineCount`, `stanzas`

### Phase 8: Redesign FormSelector in SyllableEditor.jsx
- Categorized dropdown with headers
- Search/filter input
- Info panel toggle (ⓘ button)
- Side panel component for form details

### Phase 9: CSS styling
- Category headers, search input, scrollable dropdown
- Info panel slide-in animation
- Responsive behavior

---

## Execution Strategy

**Option A: Sequential sub-agents** — Launch one agent per phase. Each reads the current file state, appends its forms, and saves.

**Option B: Single large agent in worktree** — One agent with explicit instructions to write the complete file in one pass, referencing this plan for all 58 forms.

**Option C: Two-pass** — Phase 1 creates the scaffold + all structural data (pattern/rhyme/lineCount). Phase 2 adds all cultural metadata (history/ethos/tips/poets).

**Recommended: Option A** with phases 1-6 run sequentially (each depends on prior file state). Phases 7-9 can run after all forms are in place.
