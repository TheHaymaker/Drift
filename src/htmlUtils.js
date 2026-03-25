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
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n$/, '');
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
