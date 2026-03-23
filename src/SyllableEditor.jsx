import { useState, useCallback } from 'react';
import { analyzeText, POETRY_FORMS } from './syllabify.js';

// ─── Gutter cell ──────────────────────────────────────────────────────────
function GutterCell({ value, target, isLineNum }) {
  if (isLineNum) {
    return <span className="gutter-linenum">{value}</span>;
  }
  let cls = 'gutter-sylcount';
  if (target !== undefined && value > 0) {
    if (value === target) cls += ' g-match';
    else if (Math.abs(value - target) === 1) cls += ' g-close';
    else cls += ' g-miss';
  }
  return <span className={cls}>{value > 0 ? value : <span className="gutter-empty">—</span>}</span>;
}

// ─── Haiku status strip ───────────────────────────────────────────────────
function HaikuStatus({ lines, pattern }) {
  const allMet = pattern.every((t, i) => (lines[i]?.syllableCount ?? 0) === t);
  return (
    <div className={`haiku-status ${allMet ? 'haiku-complete' : ''}`}>
      <span className="haiku-label">haiku</span>
      <span className="haiku-sep">·</span>
      {pattern.map((target, i) => {
        const actual = lines[i]?.syllableCount ?? 0;
        const met = actual === target;
        return (
          <span key={i} className={`haiku-beat ${met ? 'beat-met' : 'beat-unmet'}`}>
            <span className="beat-actual">{actual}</span>
            <span className="beat-slash">/</span>
            <span className="beat-target">{target}</span>
            {i < pattern.length - 1 && <span className="haiku-sep"> · </span>}
          </span>
        );
      })}
      {allMet && <span className="haiku-check">✓</span>}
    </div>
  );
}

// ─── SyllableEditor ───────────────────────────────────────────────────────
export default function SyllableEditor({ value, onChange }) {
  const [showLineNums, setShowLineNums] = useState(true);

  const formDef = POETRY_FORMS['haiku'];
  const analysis = analyzeText(value);

  const handleChange = useCallback(
    (e) => onChange(e.target.value),
    [onChange]
  );

  return (
    <div className="syl-editor">

      {/* ── Top mode bar ── */}
      <div className="syl-modebar">
        <span className="syl-form-name">{formDef.name}</span>
        <span className="syl-form-desc">{formDef.description}</span>
        <div className="syl-modebar-right">
          <button
            className={`syl-toggle-btn ${showLineNums ? 'active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowLineNums((v) => !v)}
          >
            line #
          </button>
        </div>
      </div>

      {/* ── Editor body: gutter + textarea ── */}
      <div className="syl-body">

        {/* ── Left gutter ── */}
        <div className="syl-gutter">
          {analysis.map((lineData, li) => (
            <div key={li} className="syl-gutter-row">
              <GutterCell
                value={lineData.syllableCount}
                target={formDef.pattern[li]}
              />
              {showLineNums && <GutterCell value={li + 1} isLineNum />}
            </div>
          ))}
        </div>

        {/* ── Textarea ── */}
        <textarea
          className="syl-textarea"
          value={value}
          onChange={handleChange}
          spellCheck={false}
          autoFocus
          placeholder="begin writing..."
        />
      </div>

      {/* ── Haiku validation footer ── */}
      <HaikuStatus lines={analysis} pattern={formDef.pattern} />
    </div>
  );
}
