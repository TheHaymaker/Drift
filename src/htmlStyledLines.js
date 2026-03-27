// ─── HTML → Styled Lines ─────────────────────────────────────────────────────
//
// Parses Tiptap HTML into an array of "styled lines" for use in the diff view.
// Each line corresponds to a <p> paragraph. Each line is an array of runs:
//   { text: string, style: string | null }

import { TAG_STYLES, mergeStyle } from './htmlTokenizer.js';
import { isHtml } from './htmlUtils.js';

// ── DOM walker ───────────────────────────────────────────────────────────────

function walkNode(node, style, runs) {
  if (node.nodeType === 3) {
    const text = node.textContent;
    if (text) {
      runs.push({ text, style: style || null });
    }
    return;
  }

  if (node.nodeType !== 1) return;

  const tag = node.tagName.toLowerCase();

  // <br> within a paragraph creates a line-internal break —
  // the caller handles splitting lines on these later.
  if (tag === 'br') {
    runs.push({ text: '\n', style: null });
    return;
  }

  const addition = TAG_STYLES[tag];
  const childStyle = addition ? mergeStyle(style, addition) : style;

  for (const child of node.childNodes) {
    walkNode(child, childStyle, runs);
  }
}

// ── Main API ─────────────────────────────────────────────────────────────────

/**
 * Parse HTML into an array of styled lines.
 * Each line = one <p> paragraph (or sub-line from <br>).
 * Each line is an array of { text, style } runs.
 *
 * For plain text (non-HTML), returns one unstyled run per line.
 */
export function htmlToStyledLines(html) {
  if (!html || !isHtml(html)) {
    const text = html || '';
    return text.split('\n').map((line) => [{ text: line, style: null }]);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const paragraphs = doc.body.children;
  const result = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const runs = [];
    walkNode(paragraphs[i], '', runs);

    // If the paragraph was empty, add an empty run
    if (runs.length === 0) {
      runs.push({ text: '', style: null });
    }

    // Split runs on internal <br> newlines into separate lines
    let currentLine = [];
    for (const run of runs) {
      if (run.text === '\n') {
        // Push current line (or empty if nothing yet) and start a new one
        if (currentLine.length === 0) {
          currentLine.push({ text: '', style: null });
        }
        result.push(currentLine);
        currentLine = [];
      } else if (run.text.includes('\n')) {
        // A text node with embedded newlines (unlikely but safe)
        const parts = run.text.split('\n');
        for (let j = 0; j < parts.length; j++) {
          if (parts[j]) {
            currentLine.push({ text: parts[j], style: run.style });
          }
          if (j < parts.length - 1) {
            if (currentLine.length === 0) {
              currentLine.push({ text: '', style: null });
            }
            result.push(currentLine);
            currentLine = [];
          }
        }
      } else {
        currentLine.push(run);
      }
    }

    // Push the last line from this paragraph
    if (currentLine.length === 0) {
      currentLine.push({ text: '', style: null });
    }
    result.push(currentLine);
  }

  return result;
}
