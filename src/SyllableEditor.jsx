import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { analyzeText, POETRY_FORMS, FORM_CATEGORIES } from './syllabify.js';
import { setCmuUpdateCallback } from './rhyme-client.js';
import RichTextEditor from './RichTextEditor.jsx';
import Minimap from './Minimap.jsx';

// ── Rhyme group colour palette ───────────────────────────────────────────────

const RHYME_COLORS = [
  'var(--rhyme-a)', // soft blue
  'var(--rhyme-b)', // coral
  'var(--rhyme-c)', // violet
  'var(--rhyme-d)', // gold
  'var(--rhyme-e)', // teal
  'var(--rhyme-f)', // pink
  'var(--rhyme-g)', // sage
];

function rhymeColor(letter) {
  const idx = letter.charCodeAt(0) - 65; // A=0, B=1, …
  return RHYME_COLORS[idx % RHYME_COLORS.length];
}

// ── Build categorized form list ─────────────────────────────────────────────

const ALL_FORM_KEYS = Object.keys(POETRY_FORMS);

/** Group form keys by category, in FORM_CATEGORIES order. */
function buildCategorizedForms() {
  const grouped = [];
  for (const cat of FORM_CATEGORIES) {
    const keys = ALL_FORM_KEYS.filter((k) => POETRY_FORMS[k].category === cat.key);
    if (keys.length > 0) grouped.push({ ...cat, keys });
  }
  return grouped;
}

const CATEGORIZED_FORMS = buildCategorizedForms();

// ── Gutter cells ─────────────────────────────────────────────────────────────

function SylCountCell({ value, target }) {
  let cls = 'gutter-sylcount';
  if (target !== undefined && target !== null && value > 0) {
    if (value === target) cls += ' g-match';
    else if (Math.abs(value - target) === 1) cls += ' g-close';
    else cls += ' g-miss';
  }
  return (
    <span className={cls}>
      {value > 0 ? value : <span className="gutter-empty">—</span>}
    </span>
  );
}

function RhymeCell({ rhymeGroup, ghost }) {
  if (!rhymeGroup) return null;
  const { expected, status } = rhymeGroup;
  const color = rhymeColor(expected);
  const cls = `gutter-rhyme r-${status}${ghost ? ' r-ghost' : ''}`;
  return (
    <span className={cls} style={{ color }}>
      {expected}
    </span>
  );
}

// ── Stanza separator ─────────────────────────────────────────────────────────

function isStanzaBoundary(lineIdx, form) {
  if (!form?.stanzas) return false;
  let acc = 0;
  for (const size of form.stanzas) {
    acc += size;
    if (lineIdx + 1 === acc) return true;
  }
  return false;
}

// ── Form selector dropdown (categorized + searchable) ───────────────────────

function FormSelector({ formKey, onChange, onInfoToggle, showInfo }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  const searchRef = useRef(null);
  const form = POETRY_FORMS[formKey];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search when opened
  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  // Reset search when closed
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  // Filter forms by search
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return CATEGORIZED_FORMS;
    const q = search.toLowerCase();
    return CATEGORIZED_FORMS
      .map((cat) => ({
        ...cat,
        keys: cat.keys.filter((k) => {
          const f = POETRY_FORMS[k];
          return f.name.toLowerCase().includes(q)
            || f.description.toLowerCase().includes(q)
            || (f.origin && f.origin.toLowerCase().includes(q));
        }),
      }))
      .filter((cat) => cat.keys.length > 0);
  }, [search]);

  return (
    <div className="form-selector" ref={ref}>
      <button
        className="form-selector-btn"
        onClick={() => setOpen((v) => !v)}
        onMouseDown={(e) => e.preventDefault()}
      >
        <span className="form-selector-caret">▾</span>
        <span className="syl-form-name">{form.name}</span>
      </button>
      <span className="syl-form-desc">{form.description}</span>
      <button
        className={`form-info-btn ${showInfo ? 'active' : ''}`}
        onClick={onInfoToggle}
        onMouseDown={(e) => e.preventDefault()}
        title="Form info"
      >
        &#9432;
      </button>

      {open && (
        <div className="form-dropdown">
          <div className="form-dropdown-search-wrap">
            <input
              ref={searchRef}
              className="form-dropdown-search"
              type="text"
              placeholder="search forms…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
          <div className="form-dropdown-list">
            {filteredCategories.map((cat) => (
              <div key={cat.key} className="form-dropdown-category">
                <div className="form-dropdown-category-label">{cat.label}</div>
                {cat.keys.map((key) => (
                  <button
                    key={key}
                    className={`form-dropdown-item ${key === formKey ? 'active' : ''}`}
                    onClick={() => { onChange(key); setOpen(false); }}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <span className="form-dropdown-name">{POETRY_FORMS[key].name}</span>
                    <span className="form-dropdown-desc">{POETRY_FORMS[key].description}</span>
                  </button>
                ))}
              </div>
            ))}
            {filteredCategories.length === 0 && (
              <div className="form-dropdown-empty">no matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Form info panel ─────────────────────────────────────────────────────────

function FormInfoPanel({ formKey }) {
  const form = POETRY_FORMS[formKey];
  if (!form) return null;

  return (
    <div className="form-info-panel">
      <div className="form-info-header">
        <span className="form-info-name">{form.name}</span>
        {form.origin && <span className="form-info-origin">{form.origin}</span>}
      </div>

      {form.summary && (
        <p className="form-info-summary">{form.summary}</p>
      )}

      {form.history && (
        <div className="form-info-section">
          <div className="form-info-section-label">History</div>
          <p>{form.history}</p>
        </div>
      )}

      {form.ethos && (
        <div className="form-info-section">
          <div className="form-info-section-label">Ethos</div>
          <p>{form.ethos}</p>
        </div>
      )}

      {form.constraints && form.constraints.length > 0 && (
        <div className="form-info-section">
          <div className="form-info-section-label">Constraints</div>
          <ul className="form-info-list">
            {form.constraints.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      {form.tips && form.tips.length > 0 && (
        <div className="form-info-section">
          <div className="form-info-section-label">Tips</div>
          <ul className="form-info-list">
            {form.tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {form.notablePoets && form.notablePoets.length > 0 && (
        <div className="form-info-section">
          <div className="form-info-section-label">Notable Poets</div>
          <p className="form-info-poets">{form.notablePoets.join(', ')}</p>
        </div>
      )}

      {form.exampleTitle && (
        <div className="form-info-section">
          <div className="form-info-section-label">Notable Example</div>
          <p className="form-info-example">{form.exampleTitle}</p>
        </div>
      )}

      {form.validationLevel && (
        <div className="form-info-validation">
          {form.validationLevel === 'full' ? 'Full validation' :
           form.validationLevel === 'partial' ? 'Partial validation' :
           'Display only — no structural validation'}
        </div>
      )}
    </div>
  );
}

// ── FormStatus strip ─────────────────────────────────────────────────────────

function FormStatus({ lines, rhymeGroups, form }) {
  const pattern = form.pattern;
  const scheme = form.rhymeScheme;
  const lineCount = form.lineCount;

  // Syllable progress
  let sylMet = 0;
  let sylTotal = 0;
  const sylBeats = [];

  if (pattern) {
    sylTotal = pattern.length;
    for (let i = 0; i < pattern.length; i++) {
      const actual = lines[i]?.syllableCount ?? 0;
      const target = pattern[i];
      const met = actual === target;
      if (met) sylMet++;
      sylBeats.push({ actual, target, met });
    }
  }

  // Rhyme progress
  const rhymeStatus = {};
  if (rhymeGroups) {
    for (const rg of rhymeGroups) {
      if (!rhymeStatus[rg.expected]) {
        rhymeStatus[rg.expected] = 'pending';
      }
      if (rg.status === 'match') rhymeStatus[rg.expected] = 'match';
      else if (rg.status === 'miss' && rhymeStatus[rg.expected] !== 'match') {
        rhymeStatus[rg.expected] = 'miss';
      }
    }
  }

  // Overall completion
  const sylComplete = !pattern || sylMet === sylTotal;
  const rhymeComplete = !scheme || Object.values(rhymeStatus).every((s) => s === 'match');
  const lineComplete = !lineCount || lines.filter((l) => l.syllableCount > 0).length >= lineCount;
  const allComplete = sylComplete && rhymeComplete && lineComplete;

  // Use per-line beats for short forms (≤5 lines), summary for longer
  const useBeats = pattern && pattern.length <= 7;

  return (
    <div className={`form-status ${allComplete ? 'form-complete' : ''}`}>
      <span className="form-status-label">{form.name}</span>
      <span className="form-status-sep">·</span>

      {/* Syllable section */}
      {pattern && useBeats && sylBeats.map((b, i) => (
        <span key={`s${i}`} className={`haiku-beat ${b.met ? 'beat-met' : 'beat-unmet'}`}>
          <span className="beat-actual">{b.actual}</span>
          <span className="beat-slash">/</span>
          <span className="beat-target">{b.target}</span>
          {i < sylBeats.length - 1 && <span className="haiku-sep"> · </span>}
        </span>
      ))}
      {pattern && !useBeats && (
        <span className={`form-status-summary ${sylComplete ? 'summary-met' : ''}`}>
          {sylMet}/{sylTotal} lines
        </span>
      )}

      {/* Rhyme section */}
      {scheme && pattern && <span className="form-status-sep">·</span>}
      {scheme && Object.entries(rhymeStatus).map(([letter, status]) => (
        <span
          key={`r${letter}`}
          className={`form-rhyme-badge r-${status}`}
          style={{ color: status === 'match' ? rhymeColor(letter) : undefined }}
        >
          {letter}{status === 'match' ? '✓' : status === 'miss' ? '✗' : '…'}
        </span>
      ))}

      {allComplete && <span className="haiku-check">✓</span>}
    </div>
  );
}

// ── Main editor component ────────────────────────────────────────────────────

export default function SyllableEditor({ value, htmlContent, onChange, onHtmlChange, initialFormKey, onFormKeyChange, editable = true }) {
  const [formKey, setFormKey] = useState(initialFormKey || 'haiku');
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showMinimap, setShowMinimap] = useState(() => localStorage.getItem('drift-minimap') === 'true');
  const [editorInstance, setEditorInstance] = useState(null);
  const [, forceUpdate] = useState(0);

  const formDef = POETRY_FORMS[formKey];
  const { lines, rhymeGroups } = analyzeText(value, formDef);

  // Listen for minimap toggle from header button
  useEffect(() => {
    const el = document.getElementById('editor');
    if (!el) return;
    const onToggle = (e) => setShowMinimap(e.detail);
    el.addEventListener('_minimap-toggle', onToggle);
    return () => el.removeEventListener('_minimap-toggle', onToggle);
  }, []);

  // Re-render when CMU data arrives
  useEffect(() => {
    setCmuUpdateCallback(() => forceUpdate((n) => n + 1));
    return () => setCmuUpdateCallback(null);
  }, []);

  const handleEditorUpdate = useCallback(
    (html, plainText) => {
      onChange(plainText);
      onHtmlChange?.(html);
    },
    [onChange, onHtmlChange]
  );

  // Determine gutter rows: actual lines + ghost rows for fixed-length forms
  const hasRhyme = !!formDef.rhymeScheme;
  const displayLineCount = formDef.lineCount
    ? Math.max(lines.length, formDef.lineCount)
    : lines.length;

  // For ghost rows, build rhyme groups for unwritten lines
  const schemeLetters = formDef.rhymeScheme === 'couplet'
    ? null // couplets don't show ghost rows (no fixed length)
    : Array.isArray(formDef.rhymeScheme) ? formDef.rhymeScheme : null;

  return (
    <div className="syl-editor">

      {/* ── Top mode bar ── */}
      <div className="syl-modebar">
        <FormSelector
          formKey={formKey}
          onChange={(key) => { setFormKey(key); onFormKeyChange?.(key); }}
          showInfo={showInfoPanel}
          onInfoToggle={() => setShowInfoPanel((v) => !v)}
        />
        <div className="syl-modebar-right">
        </div>
      </div>

      {/* ── Editor body + optional info panel ── */}
      <div className={`syl-body-wrap${showInfoPanel ? ' with-info' : ''}`}>
        <div className="syl-body">

          {/* ── Left gutter ── */}
          <div className="syl-gutter">
            {Array.from({ length: displayLineCount }, (_, li) => {
              const lineData = lines[li];
              const isGhost = li >= lines.length || !lineData || lineData.syllableCount === 0;
              const isActualLine = li < lines.length;
              const sylCount = lineData?.syllableCount ?? 0;
              const sylTarget = formDef.pattern?.[li];
              const rhymeGroup = rhymeGroups?.[li]
                ?? (isGhost && schemeLetters?.[li]
                  ? { expected: schemeLetters[li], status: 'pending', matchedWith: [] }
                  : null);

              const stanzaBoundary = isStanzaBoundary(li, formDef);

              return (
                <div
                  key={li}
                  className={`syl-gutter-row${stanzaBoundary ? ' stanza-boundary' : ''}${isGhost && !isActualLine ? ' ghost-row' : ''}`}
                >
                  {formDef.pattern && (
                    <SylCountCell
                      value={sylCount}
                      target={sylTarget}
                    />
                  )}
                  {hasRhyme && (
                    <RhymeCell
                      rhymeGroup={rhymeGroup}
                      ghost={isGhost && !isActualLine}
                    />
                  )}
                  <span className="gutter-linenum">{li + 1}</span>
                </div>
              );
            })}
          </div>

          {/* ── Rich text editor ── */}
          <RichTextEditor
            className="syl-rich-editor"
            content={htmlContent}
            onUpdate={handleEditorUpdate}
            placeholder="begin writing..."
            autoFocus
            editable={editable}
            onEditorReady={setEditorInstance}
          />
        </div>

        {/* ── Minimap (outside syl-body so it stays sticky) ── */}
        {showMinimap && editorInstance && <Minimap editor={editorInstance} />}

        {/* ── Info panel ── */}
        {showInfoPanel && <FormInfoPanel formKey={formKey} />}
      </div>

      {/* ── Status footer ── */}
      <FormStatus lines={lines} rhymeGroups={rhymeGroups} form={formDef} />
    </div>
  );
}
