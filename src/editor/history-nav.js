// src/editor/history-nav.js
import { state } from '../state.js';
import { renderCommits } from './commit-list.js';
import { showToast } from '../toast.js';
import { setEditorContent, setEditorEditable } from '../views/editor.js';
import { renderDiff } from './diff-panel.js';

const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const navBanner = document.getElementById("navBanner");
const navBannerText = document.getElementById("navBannerText");
const navBannerClose = document.getElementById("navBannerClose");
const diffPanel = document.getElementById("diffPanel");

export function updateNavButtons() {
  if (!state.commitLog.length) {
    undoBtn.disabled = true;
    redoBtn.disabled = true;
    return;
  }
  if (state.historyPosition === -1) {
    // At HEAD — can undo if there's more than one commit
    undoBtn.disabled = state.commitLog.length <= 1;
    redoBtn.disabled = true;
  } else {
    undoBtn.disabled = state.historyPosition <= 0;
    redoBtn.disabled = state.historyPosition >= state.commitLog.length - 1;
  }
}

export function updateNavUI() {
  updateNavButtons();
  // Highlight the current commit in the list
  document.querySelectorAll(".commit-item").forEach(el => {
    el.classList.remove("viewing", "active");
  });
  if (state.historyPosition >= 0) {
    const items = document.querySelectorAll(".commit-item");
    // Items are in reverse order, so index 0 in DOM = last commit
    const domIndex = state.commitLog.length - 1 - state.historyPosition;
    if (items[domIndex]) items[domIndex].classList.add("viewing");
    navBannerText.textContent = "viewing snapshot #" + (state.historyPosition + 1) + " of " + state.commitLog.length;
    navBanner.classList.remove("hidden");
    setEditorEditable(false);
  } else {
    navBanner.classList.add("hidden");
    setEditorEditable(true);
  }
}

export function exitNavMode() {
  state.historyPosition = -1;
  updateNavUI();
  diffPanel.classList.add("hidden");
}

export async function restoreHeadContent() {
  if (!state.commitLog.length) return;
  const head = state.commitLog[state.commitLog.length - 1];
  const content = await fetchSnapshot(head.hash);
  setEditorContent(content);
}

export async function loadSnapshot(c) {
  if (c.index > 0) {
    const prev = state.commitLog[c.index - 1];
    const [snapContent, diffSegments] = await Promise.all([
      fetchSnapshot(c.hash),
      fetchDiff(prev.hash, c.hash),
    ]);
    setEditorContent(snapContent);
    showToast("viewing #" + (c.index + 1) + " " + c.hash);
    renderDiff(diffSegments, c);
  } else {
    const snapContent = await fetchSnapshot(c.hash);
    setEditorContent(snapContent);
    showToast("viewing #" + (c.index + 1) + " " + c.hash);
    renderDiff(snapContent ? [{ type: "added", text: snapContent }] : [], c);
  }
}

export async function undoCommit() {
  if (state.commitLog.length <= 1) return;
  if (state.historyPosition === -1) {
    state.historyPosition = state.commitLog.length - 2; // go to second-to-last
  } else if (state.historyPosition > 0) {
    state.historyPosition--;
  } else {
    return;
  }
  updateNavUI();
  await loadSnapshot(state.commitLog[state.historyPosition]);
}

export async function redoCommit() {
  if (state.historyPosition === -1) return;
  if (state.historyPosition < state.commitLog.length - 1) {
    state.historyPosition++;
    if (state.historyPosition === state.commitLog.length - 1) {
      // Back at HEAD
      exitNavMode();
      await restoreHeadContent();
    } else {
      updateNavUI();
      await loadSnapshot(state.commitLog[state.historyPosition]);
    }
  }
}

export async function fetchSnapshot(hash) {
  if (state.gitClient && state.currentDocId && state.currentFilename) {
    try {
      const snap = await state.gitClient.getFileAt({ docId: state.currentDocId, filename: state.currentFilename, hash });
      return snap.content;
    } catch { /* fall through */ }
  }
  const d = await fetch("/api/documents/" + state.currentDocId + "/snapshot/" + hash).then(r => r.json());
  return d.content;
}

export async function fetchDiff(hashA, hashB) {
  if (state.gitClient && state.currentDocId && state.currentFilename) {
    try {
      const result = await state.gitClient.getStructuredDiff({ docId: state.currentDocId, filename: state.currentFilename, hashA, hashB });
      return result.segments;
    } catch { /* fall through */ }
  }
  const d = await fetch("/api/documents/" + state.currentDocId + "/structured-diff/" + hashA + "/" + hashB).then(r => r.json());
  return d.segments;
}

undoBtn.addEventListener("click", undoCommit);
redoBtn.addEventListener("click", redoCommit);
navBannerClose.addEventListener("click", async () => {
  exitNavMode();
  await restoreHeadContent();
});

// Keyboard shortcuts for undo/redo navigation
document.addEventListener("keydown", (e) => {
  const editor = document.getElementById("editor");
  // Only intercept when in nav mode or when editor is focused
  const isEditorFocused = document.activeElement === editor || editor.contains(document.activeElement);
  if (!state.currentDocId) return;

  // Ctrl/Cmd + Shift + Z = redo
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Z") {
    if (state.historyPosition !== -1) {
      e.preventDefault();
      redoCommit();
    }
    return;
  }

  // Ctrl/Cmd + Z = undo (only when in nav mode or not actively editing to not interfere with text undo)
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
    if (state.historyPosition !== -1 || !isEditorFocused) {
      e.preventDefault();
      undoCommit();
    }
    return;
  }

  // Escape = clear commit selection
  if (e.key === "Escape" && state.selectedCommits.size > 0) {
    e.preventDefault();
    import('./selection.js').then(({ clearSelection }) => clearSelection());
    return;
  }

  // Delete/Backspace = delete selected commits
  if ((e.key === "Delete" || e.key === "Backspace") && state.selectedCommits.size > 0 && !isEditorFocused) {
    e.preventDefault();
    import('./selection.js').then(({ showDeleteModal }) => showDeleteModal([...state.selectedCommits]));
    return;
  }
});
