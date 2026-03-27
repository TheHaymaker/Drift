// src/editor/diff-panel.js

import { htmlToStyledLines } from '../htmlStyledLines.js';
import { isHtml, stripHtml } from '../htmlUtils.js';

const diffPanel = document.getElementById("diffPanel");
const diffTitle = document.getElementById("diffTitle");
const diffBody = document.getElementById("diffBody");
const diffClose = document.getElementById("diffClose");

export function renderDiff(segments, commit, { rawA, rawB } = {}) {
  if (!segments || segments.length === 0) {
    diffPanel.classList.add("hidden");
    return;
  }

  // Parse raw HTML into styled line arrays for formatting lookup
  const oldLines = rawA && isHtml(rawA) ? htmlToStyledLines(rawA) : null;
  const newLines = rawB && isHtml(rawB) ? htmlToStyledLines(rawB) : null;

  // If no raw HTML available (server-side fallback), strip HTML from segments
  if (!oldLines && !newLines) {
    for (const seg of segments) {
      if (isHtml(seg.text)) {
        seg.text = stripHtml(seg.text) + "\n";
      }
    }
  }

  diffTitle.textContent = commit.hash + " \u2014 " + commit.message;
  const fragment = document.createDocumentFragment();

  let oldLineIdx = 0;
  let newLineIdx = 0;

  for (const seg of segments) {
    const segLines = seg.text.split("\n");
    // Trailing \n produces an empty last element — skip it
    const lineCount = seg.text.endsWith("\n") ? segLines.length - 1 : segLines.length;

    for (let i = 0; i < lineCount; i++) {
      const lineText = segLines[i];
      let styledRuns = null;

      // Look up styled runs from the appropriate source
      if (seg.type === "removed" && oldLines && oldLineIdx < oldLines.length) {
        styledRuns = oldLines[oldLineIdx];
      } else if (seg.type === "added" && newLines && newLineIdx < newLines.length) {
        styledRuns = newLines[newLineIdx];
      } else if (seg.type === "kept" && newLines && newLineIdx < newLines.length) {
        styledRuns = newLines[newLineIdx];
      }

      if (styledRuns) {
        // Render each run as a styled span with diff coloring + formatting
        for (const run of styledRuns) {
          const span = document.createElement("span");
          span.className = "diff-seg diff-" + seg.type;
          if (run.style) span.style.cssText = run.style;
          span.textContent = run.text;
          fragment.appendChild(span);
        }
      } else {
        // Fallback: plain text rendering (no formatting available)
        const span = document.createElement("span");
        span.className = "diff-seg diff-" + seg.type;
        span.textContent = lineText;
        fragment.appendChild(span);
      }

      // Add newline between lines
      fragment.appendChild(document.createTextNode("\n"));

      // Advance line counters
      if (seg.type === "removed") {
        oldLineIdx++;
      } else if (seg.type === "added") {
        newLineIdx++;
      } else {
        // "kept" — advances both
        oldLineIdx++;
        newLineIdx++;
      }
    }
  }

  diffBody.innerHTML = "";
  diffBody.appendChild(fragment);
  diffPanel.classList.remove("hidden");
}

export function closeDiff() {
  diffPanel.classList.add("hidden");
}

diffClose.addEventListener("click", closeDiff);
