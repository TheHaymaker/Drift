import { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { analyzeText, POETRY_FORMS } from './syllabify.js';

// ─── Scalable curly over-brace ─────────────────────────────────────────────
// SVG stretches horizontally via preserveAspectRatio="none" and width="100%".
// Parent width is determined by the ghost-text span below it in the same
// column-flex unit, so the brace naturally scales to the syllable's width.
function SyllableBrace() {
  return (
    <svg
      className="syl-brace"
      viewBox="0 0 100 14"
      preserveAspectRatio="none"
      width="100%"
      height="11"
      aria-hidden="true"
    >
      {/* Over-brace: bottom-left → curves up → slight centre dip → curves up → bottom-right */}
      <path
        d="M2,13 C2,3 20,0 50,8 C80,0 98,3 98,13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── One syllable column (brace above, ghost text below) ──────────────────
// The ghost text sizes the column so the SVG brace auto-scales to match.
function SylUnit({ text }) {
  return (
    <span className="syl-unit">
      <SyllableBrace />
      {/* Ghost text: invisible but holds space for the brace to scale to */}
      <span className="syl-ghost">{text}</span>
    </span>
  );
}

// ─── Overlay representation of one word ───────────────────────────────────
function OverlayWord({ token }) {
  if (token.type === 'space') {
    return <span className="syl-ospace">{token.text}</span>;
  }
  return (
    <span className="syl-oword">
      {token.syllables.map((s, i) => (
        <SylUnit key={i} text={s} />
      ))}
    </span>
  );
}

// ─── Cursor helpers ────────────────────────────────────────────────────────
// Cursor position is tracked as { line: number, ch: number }.
// "ch" counts only characters in visible (non-aria-hidden) text nodes within
// the line's text row, so it stays stable across re-renders that rebuild the
// aria-hidden overlay structure.

function isInAriaHidden(node, root) {
  let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  while (el && el !== root) {
    if (el.getAttribute('aria-hidden') === 'true') return true;
    el = el.parentElement;
  }
  return false;
}

function makeTextWalker(lineEl) {
  return document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return isInAriaHidden(node, lineEl)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
}

function getCaretPos(editorEl) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);

  const lineDivs = editorEl.querySelectorAll('[data-line]');
  for (let li = 0; li < lineDivs.length; li++) {
    const lineEl = lineDivs[li];
    if (!lineEl.contains(range.endContainer)) continue;

    let ch = 0;
    const walker = makeTextWalker(lineEl);
    let node;
    while ((node = walker.nextNode())) {
      if (node === range.endContainer) {
        return { line: li, ch: ch + range.endOffset };
      }
      ch += node.length;
    }
    return { line: li, ch };
  }
  return null;
}

function setCaretPos(editorEl, pos) {
  if (!pos) return;
  const lineDivs = editorEl.querySelectorAll('[data-line]');
  const lineEl = lineDivs[pos.line];
  if (!lineEl) return;

  let remaining = pos.ch;
  const walker = makeTextWalker(lineEl);
  let node;
  while ((node = walker.nextNode())) {
    if (remaining <= node.length) {
      try {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) { /* ignore stale node refs */ }
      return;
    }
    remaining -= node.length;
  }
  // Fallback: end of line
  try {
    const range = document.createRange();
    range.selectNodeContents(lineEl);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  } catch (_) {}
}

// ─── Extract plain text from the contenteditable ──────────────────────────
// Reads only from non-aria-hidden text nodes, joining lines with '\n'.
function extractText(editorEl) {
  const lineDivs = editorEl.querySelectorAll('[data-line]');
  return Array.from(lineDivs)
    .map((lineEl) => {
      let text = '';
      const walker = makeTextWalker(lineEl);
      let node;
      while ((node = walker.nextNode())) text += node.textContent;
      return text;
    })
    .join('\n');
}

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

  const editorRef   = useRef(null);
  const caretRef    = useRef(null);
  const pendingRef  = useRef(false); // true when onChange was called and DOM needs caret restore

  const formDef = POETRY_FORMS['haiku'];
  const analysis = analyzeText(value);

  // Save caret synchronously at render time (before DOM mutations).
  // Only save if we're in the middle of an input cycle.
  if (pendingRef.current && editorRef.current) {
    caretRef.current = getCaretPos(editorRef.current);
  }

  // Restore caret synchronously after DOM mutations.
  useLayoutEffect(() => {
    if (pendingRef.current && caretRef.current && editorRef.current) {
      setCaretPos(editorRef.current, caretRef.current);
      pendingRef.current = false;
    }
  });

  // ── Handle typing ─────────────────────────────────────────────────────
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    pendingRef.current = true;
    const newText = extractText(editorRef.current);
    onChange(newText);
  }, [onChange]);

  // ── Handle Enter key ──────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();

      if (!editorRef.current) return;
      const pos = getCaretPos(editorRef.current);
      const lines = value.split('\n');
      const li = pos ? pos.line : lines.length - 1;
      const ch = pos ? pos.ch : (lines[li]?.length ?? 0);
      const line = lines[li] ?? '';

      const newLines = [
        ...lines.slice(0, li),
        line.slice(0, ch),
        line.slice(ch),
        ...lines.slice(li + 1),
      ];

      pendingRef.current = true;
      caretRef.current = { line: li + 1, ch: 0 };
      onChange(newLines.join('\n'));
    },
    [value, onChange]
  );

  // ── Strip rich HTML from paste ────────────────────────────────────────
  const handlePaste = useCallback(
    (e) => {
      e.preventDefault();
      const plain = e.clipboardData.getData('text/plain');
      if (!plain) return;
      document.execCommand('insertText', false, plain);
    },
    []
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
            onMouseDown={(e) => e.preventDefault()} // keep focus in editor
            onClick={() => setShowLineNums((v) => !v)}
          >
            line #
          </button>
        </div>
      </div>

      {/* ── Editor body: gutter + content ── */}
      <div className="syl-body">

        {/* ── Left gutter ── */}
        <div className="syl-gutter">
          {analysis.map((lineData, li) => (
            <div key={li} className="syl-gutter-row">
              {/* Outer column: syllable count */}
              <GutterCell
                value={lineData.syllableCount}
                target={formDef.pattern[li]}
              />
              {/* Inner column: line number */}
              {showLineNums && <GutterCell value={li + 1} isLineNum />}
            </div>
          ))}
        </div>

        {/* ── Contenteditable editor ── */}
        <div
          ref={editorRef}
          className="syl-content"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          autoFocus
        >
          {analysis.map((lineData, li) => (
            <div key={li} data-line={li} className="syl-line">

              {/*
               * OVERLAY ROW — aria-hidden + contentEditable=false so:
               * • extractText() skips it entirely
               * • getCaretPos / setCaretPos skip its text nodes
               * • the cursor cannot enter it; clicks fall through to the text row
               * • pointer-events: none (CSS) ensures mouse events reach text row
               */}
              <div
                className="syl-overlay-row"
                contentEditable={false}
                aria-hidden="true"
              >
                {lineData.tokens.map((token, ti) => (
                  <OverlayWord key={ti} token={token} />
                ))}
                {/* Non-breaking space keeps empty lines from collapsing */}
                {lineData.tokens.length === 0 && '\u00a0'}
              </div>

              {/*
               * TEXT ROW — the actual editable content.
               * Cursor lives here; extractText() reads from here.
               */}
              <div className="syl-text-row">
                {lineData.tokens.length > 0
                  ? lineData.tokens.map((token, ti) => (
                      <span key={ti}>{token.text}</span>
                    ))
                  : '\u00a0' /* keep empty line from collapsing */
                }
              </div>

            </div>
          ))}
        </div>
      </div>

      {/* ── Haiku validation footer ── */}
      <HaikuStatus lines={analysis} pattern={formDef.pattern} />
    </div>
  );
}
