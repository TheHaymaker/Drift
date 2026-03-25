// ─── HTML → Magic Move tokens ────────────────────────────────────────────────
//
// Parses Tiptap HTML into the ThemedToken[][] format expected by
// shiki-magic-move's `toKeyedTokens()`, preserving inline formatting
// (bold, italic, underline, strikethrough, superscript, subscript)
// as `htmlStyle` on each token.

import { toKeyedTokens } from 'shiki-magic-move/core';
import { isHtml, stripHtml } from './htmlUtils.js';

function getDefaultColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#d4c5a9';
}

// ── Style helpers ────────────────────────────────────────────────────────────

const TAG_STYLES = {
  strong: 'font-weight:700',
  b:      'font-weight:700',
  em:     'font-style:italic',
  i:      'font-style:italic',
  u:      'text-decoration:underline',
  s:      'text-decoration:line-through',
  sup:    'vertical-align:super;font-size:0.8em',
  sub:    'vertical-align:sub;font-size:0.8em',
};

function mergeStyle(existing, addition) {
  if (!existing) return addition;
  // Handle multiple text-decoration values
  if (existing.includes('text-decoration:') && addition.includes('text-decoration:')) {
    const prev = existing.match(/text-decoration:([^;]+)/)?.[1] || '';
    const next = addition.match(/text-decoration:([^;]+)/)?.[1] || '';
    return existing.replace(
      /text-decoration:[^;]+/,
      `text-decoration:${prev} ${next}`
    );
  }
  return `${existing};${addition}`;
}

// ── DOM walker ───────────────────────────────────────────────────────────────

function walkNode(node, style, tokens, offsetRef) {
  if (node.nodeType === 3) {
    // Text node
    const text = node.textContent;
    if (text) {
      tokens.push({
        content: text,
        offset: offsetRef.value,
        color: getDefaultColor(),
        ...(style ? { htmlStyle: style } : {}),
      });
      offsetRef.value += text.length;
    }
    return;
  }

  if (node.nodeType !== 1) return; // skip comments, etc.

  const tag = node.tagName.toLowerCase();
  const addition = TAG_STYLES[tag];
  const childStyle = addition ? mergeStyle(style, addition) : style;

  for (const child of node.childNodes) {
    walkNode(child, childStyle, tokens, offsetRef);
  }
}

// ── Main API ─────────────────────────────────────────────────────────────────

/**
 * Parse HTML into a 2D token array (lines × tokens per line).
 * Each token has { content, offset, color, htmlStyle? }.
 */
export function htmlToTokenLines(html) {
  if (!html || !isHtml(html)) {
    // Legacy plain text: one unstyled token per line
    const text = html || '';
    const lines = text.split('\n');
    let offset = 0;
    return lines.map((line) => {
      const token = {
        content: line,
        offset,
        color: getDefaultColor(),
      };
      offset += line.length + 1; // +1 for the newline
      return [token];
    });
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const paragraphs = doc.body.children;
  const result = [];
  const offsetRef = { value: 0 };

  for (let i = 0; i < paragraphs.length; i++) {
    const tokens = [];
    walkNode(paragraphs[i], '', tokens, offsetRef);

    // If the paragraph was empty, add an empty token
    if (tokens.length === 0) {
      tokens.push({ content: '', offset: offsetRef.value, color: DEFAULT_COLOR });
    }

    result.push(tokens);

    // Account for the newline between paragraphs
    if (i < paragraphs.length - 1) {
      offsetRef.value += 1; // newline separator
    }
  }

  return result;
}

/**
 * Convert HTML content to a KeyedTokensInfo object for ShikiMagicMovePrecompiled.
 */
export function htmlToKeyedTokens(html) {
  const plainText = isHtml(html) ? stripHtml(html) : (html || '');
  const tokenLines = htmlToTokenLines(html);

  const keyed = toKeyedTokens(plainText, tokenLines);

  // Set theme colors to match Drift's palette
  return {
    ...keyed,
    bg: 'transparent',
    fg: getDefaultColor(),
    rootStyle: '',
    themeName: 'drift',
  };
}
