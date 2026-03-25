// ─── HTML ↔ Plain Text utilities ─────────────────────────────────────────────

/**
 * Detect whether a string contains HTML markup (i.e. was saved by the rich
 * text editor) vs legacy plain text content.
 */
export function isHtml(content) {
  return /<\/?(?:p|br|strong|em|s|u|sub|sup|code|blockquote)[\s>]/i.test(content);
}

/**
 * Convert an HTML string (as produced by Tiptap's getHTML()) to plain text.
 * Paragraph breaks become newlines; inline tags are stripped.
 */
export function stripHtml(html) {
  if (!html) return '';
  return html
    // Remove Tiptap/ProseMirror trailing breaks inside paragraphs (empty line markers)
    .replace(/<br\s*(?:class="[^"]*")?\s*\/?>\s*<\/p>/gi, '</p>')
    // Soft line breaks (shift+enter) within a paragraph
    .replace(/<br\s*\/?>/gi, '\n')
    // Paragraph boundaries → single newline
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    // Opening/closing p tags → nothing (not extra newlines)
    .replace(/<\/?p[^>]*>/gi, '')
    // Strip all remaining HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode common entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse 3+ consecutive newlines into 2 (preserve intentional blank lines)
    .replace(/\n{3,}/g, '\n\n')
    // Trim leading/trailing newlines
    .replace(/^\n+|\n+$/g, '');
}

/**
 * Convert legacy plain text to Tiptap-compatible HTML.
 * Each line becomes a <p>; empty lines become <p></p> (blank paragraphs).
 */
export function plainTextToHtml(text) {
  if (!text) return '<p></p>';
  return text
    .split('\n')
    .map((line) => `<p>${line || ''}</p>`)
    .join('');
}

/**
 * Normalise stored content into Tiptap HTML, auto-detecting legacy plain text.
 */
export function contentToHtml(content) {
  if (!content) return '<p></p>';
  if (isHtml(content)) return content;
  return plainTextToHtml(content);
}
