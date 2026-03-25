/**
 * Generates a human-readable git commit message from before/after text content.
 */

// ─── HTML stripping for commit message analysis ───

function stripHtml(html) {
  if (!html) return '';
  return html
    // Remove Tiptap/ProseMirror trailing breaks inside paragraphs
    .replace(/<br\s*(?:class="[^"]*")?\s*\/?>\s*<\/p>/gi, '</p>')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<\/?p[^>]*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

export function generateCommitMessage(oldRaw, newRaw) {
  const oldText = stripHtml(oldRaw);
  const newText = stripHtml(newRaw);
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  if (oldText === "") return "begin";

  const oldWords = oldText.split(/\s+/).filter(Boolean);
  const newWords = newText.split(/\s+/).filter(Boolean);
  const added = newWords.length - oldWords.length;

  const changedLines = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    if ((oldLines[i] || "") !== (newLines[i] || "")) {
      changedLines.push(i);
    }
  }

  if (newLines.length > oldLines.length && added > 0) {
    const newContent = newLines.filter(
      (l, i) => i >= oldLines.length || l !== oldLines[i]
    );
    const preview = newContent.join(" ").slice(0, 40);
    if (preview.trim())
      return `+ ${preview}${preview.length >= 40 ? "\u2026" : ""}`;
    return `+ ${added} word${added !== 1 ? "s" : ""}`;
  }

  if (newLines.length < oldLines.length) {
    const removed = oldWords.length - newWords.length;
    return `- ${removed} word${removed !== 1 ? "s" : ""}, ${oldLines.length - newLines.length} line${oldLines.length - newLines.length !== 1 ? "s" : ""}`;
  }

  if (changedLines.length === 1) {
    const li = changedLines[0];
    const oldL = oldLines[li] || "";
    const newL = newLines[li] || "";
    if (oldL && newL) {
      const ow = oldL.split(/\s+/);
      const nw = newL.split(/\s+/);
      const changed = nw.filter((w) => !ow.includes(w));
      if (changed.length <= 3 && changed.length > 0) {
        return `~ ${changed.join(" ")}`;
      }
    }
    const preview = (newLines[li] || "").slice(0, 40);
    return `~ line ${li + 1}: ${preview}`;
  }

  if (changedLines.length > 1) {
    return `~ ${changedLines.length} lines revised`;
  }

  if (added > 0) return `+ ${added} word${added !== 1 ? "s" : ""}`;
  if (added < 0)
    return `- ${Math.abs(added)} word${Math.abs(added) !== 1 ? "s" : ""}`;
  return "pause";
}
