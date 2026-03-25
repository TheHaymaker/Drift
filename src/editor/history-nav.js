// src/editor/history-nav.js
import { state } from '../state.js';
import { showToast } from '../toast.js';
import { renderDiff } from './diff-panel.js';

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

// Show diff for a commit without changing editor content or entering nav mode
export async function showCommitDiff(c) {
  if (c.index > 0) {
    const prev = state.commitLog[c.index - 1];
    const diffSegments = await fetchDiff(prev.hash, c.hash);
    renderDiff(diffSegments, c);
  } else {
    const snapContent = await fetchSnapshot(c.hash);
    renderDiff(snapContent ? [{ type: "added", text: snapContent }] : [], c);
  }
}

// Keyboard shortcuts for commit selection management
document.addEventListener("keydown", (e) => {
  const editor = document.getElementById("editor");
  const isEditorFocused = document.activeElement === editor || editor.contains(document.activeElement);
  if (!state.currentDocId) return;

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
