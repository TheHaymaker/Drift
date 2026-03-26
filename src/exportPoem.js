// src/exportPoem.js – Export logic for history (JSON), poem (PDF), poem (DOCX)

import { stripHtml } from './htmlUtils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getExportFilename(state, ext) {
  const base = (state.currentFilename || 'poem').replace(/\.[^.]+$/, '');
  return base + '.' + ext;
}

/**
 * Parse Tiptap HTML into structured blocks for PDF/DOCX rendering.
 * Returns Array<Array<{ text, bold, italic, underline, strike }>>
 * Each outer array = paragraph, each inner array = formatted text run.
 */
function parseHtmlToBlocks(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = [];

  function walkInline(node, flags) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        return [{ text: node.textContent, ...flags }];
      }
      return [];
    }
    const tag = node.nodeName.toLowerCase();
    const next = { ...flags };
    if (tag === 'strong' || tag === 'b') next.bold = true;
    if (tag === 'em' || tag === 'i') next.italic = true;
    if (tag === 'u') next.underline = true;
    if (tag === 's') next.strike = true;
    if (tag === 'code') next.code = true;
    if (tag === 'br') return [{ text: '\n', ...flags }];

    const runs = [];
    for (const child of node.childNodes) {
      runs.push(...walkInline(child, next));
    }
    return runs;
  }

  // Collect top-level block elements (p, blockquote, etc.)
  const bodyChildren = doc.body.children.length ? doc.body.children : doc.body.childNodes;
  for (const el of bodyChildren) {
    const runs = walkInline(el, { bold: false, italic: false, underline: false, strike: false, code: false });
    blocks.push(runs);
  }

  return blocks;
}

// ─── Export: History as JSON ──────────────────────────────────────────────────

export async function exportHistoryJson(state, showToast) {
  if (!state.currentDocId) return;
  try {
    let snapshots;
    if (state.gitClient && state.currentFilename) {
      const logResult = await state.gitClient.getLog({ docId: state.currentDocId });
      snapshots = [];
      for (const c of logResult.log) {
        const snap = await state.gitClient.getFileAt({ docId: state.currentDocId, filename: state.currentFilename, hash: c.hash });
        snapshots.push({ ...c, content: snap.content });
      }
    } else {
      const log = await fetch('/api/documents/' + state.currentDocId + '/log').then(r => r.json());
      snapshots = [];
      for (const c of log) {
        const snap = await fetch('/api/documents/' + state.currentDocId + '/snapshot/' + c.hash).then(r => r.json());
        snapshots.push({ ...c, content: snap.content });
      }
    }
    const blob = new Blob([JSON.stringify(snapshots, null, 2)], { type: 'application/json' });
    triggerDownload(blob, 'drift-export-' + Date.now() + '.json');
    showToast('exported ' + snapshots.length + ' snapshots');
  } catch (e) {
    showToast('export failed');
  }
}

// ─── Export: Poem as PDF ──────────────────────────────────────────────────────

export async function exportPoemPdf(state, showToast) {
  const html = state.currentHtml;
  if (!html || !stripHtml(html).trim()) {
    showToast('nothing to export');
    return;
  }
  try {
    const { jsPDF } = await import('jspdf');
    const blocks = parseHtmlToBlocks(html);

    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const marginLeft = 72;
    const marginTop = 72;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - marginLeft * 2;
    const lineHeight = 18;
    let y = marginTop;

    for (const runs of blocks) {
      // Empty paragraph = stanza break
      if (runs.length === 0 || (runs.length === 1 && !runs[0].text.trim())) {
        y += lineHeight;
        if (y > pageHeight - marginTop) { doc.addPage(); y = marginTop; }
        continue;
      }

      // Build the full paragraph text and split lines for wrapping
      let x = marginLeft;
      for (const run of runs) {
        if (run.text === '\n') {
          y += lineHeight;
          x = marginLeft;
          if (y > pageHeight - marginTop) { doc.addPage(); y = marginTop; }
          continue;
        }

        const style = (run.bold && run.italic) ? 'bolditalic'
          : run.bold ? 'bold'
          : run.italic ? 'italic'
          : 'normal';
        const fontName = run.code ? 'Courier' : 'Times';
        doc.setFont(fontName, style);
        doc.setFontSize(12);

        // Split text by maxWidth from current x position
        const lines = doc.splitTextToSize(run.text, maxWidth - (x - marginLeft));
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) { y += lineHeight; x = marginLeft; }
          if (y > pageHeight - marginTop) { doc.addPage(); y = marginTop; }
          doc.text(lines[i], x, y);
          x += doc.getTextWidth(lines[i]);
        }
      }
      y += lineHeight;
      if (y > pageHeight - marginTop) { doc.addPage(); y = marginTop; }
    }

    const blob = doc.output('blob');
    triggerDownload(blob, getExportFilename(state, 'pdf'));
    showToast('exported as pdf');
  } catch (e) {
    showToast('pdf export failed');
  }
}

// ─── Export: Poem as DOCX ─────────────────────────────────────────────────────

export async function exportPoemDocx(state, showToast) {
  const html = state.currentHtml;
  if (!html || !stripHtml(html).trim()) {
    showToast('nothing to export');
    return;
  }
  try {
    const { Document, Packer, Paragraph, TextRun } = await import('docx');
    const blocks = parseHtmlToBlocks(html);

    const paragraphs = [];
    for (const runs of blocks) {
      if (runs.length === 0 || (runs.length === 1 && !runs[0].text.trim())) {
        paragraphs.push(new Paragraph({}));
        continue;
      }

      const textRuns = [];
      for (const run of runs) {
        textRuns.push(new TextRun({
          text: run.text,
          bold: run.bold || false,
          italics: run.italic || false,
          underline: run.underline ? {} : undefined,
          strike: run.strike || false,
          font: run.code ? 'Courier New' : 'Times New Roman',
          size: 24, // half-points → 12pt
          break: run.text === '\n' ? 1 : undefined,
        }));
      }
      paragraphs.push(new Paragraph({ children: textRuns }));
    }

    const doc = new Document({
      sections: [{ children: paragraphs }],
    });

    const blob = await Packer.toBlob(doc);
    triggerDownload(blob, getExportFilename(state, 'docx'));
    showToast('exported as docx');
  } catch (e) {
    showToast('docx export failed');
  }
}
