// src/editor/selection.js
import { state } from '../state.js';
import { renderCommits } from './commit-list.js';
// Lazy import to avoid circular: editor → commit-list → selection → editor
let _setEditorContent = () => {};
import('../views/editor.js').then(m => { _setEditorContent = m.setEditorContent; });
function setEditorContent(content) { _setEditorContent(content); }
import { showToast } from '../toast.js';

// Lazy import to avoid circular dep: commit-list → selection → history-nav → commit-list
let _exitNavMode = () => {};
import('./history-nav.js').then(m => { _exitNavMode = m.exitNavMode; });
function exitNavMode() { _exitNavMode(); }

const selectionActionBar = document.getElementById("selectionActionBar");
const selectionCountText = document.getElementById("selectionCountText");
const squashSelectedBtn = document.getElementById("squashSelectedBtn");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const clearSelectionBtn = document.getElementById("clearSelectionBtn");
const squashModal = document.getElementById("squashModal");
const squashModalCount = document.getElementById("squashModalCount");
const squashModalMessage = document.getElementById("squashModalMessage");
const squashModalHelp = document.getElementById("squashModalHelp");
const squashHelpText = document.getElementById("squashHelpText");
const squashModalConfirm = document.getElementById("squashModalConfirm");
const squashModalCancel = document.getElementById("squashModalCancel");
const deleteModal = document.getElementById("deleteModal");
const deleteModalCount = document.getElementById("deleteModalCount");
const deleteModalConfirm = document.getElementById("deleteModalConfirm");
const deleteModalCancel = document.getElementById("deleteModalCancel");

export function clearSelection() {
  state.selectedCommits.clear();
  state.lastSelectedIndex = null;
  updateSelectionUI();
  renderCommits(state.commitLog);
}

export function updateSelectionUI() {
  const count = state.selectedCommits.size;
  if (count > 0) {
    selectionActionBar.classList.remove("hidden");
    selectionCountText.textContent = count + " selected";
    squashSelectedBtn.disabled = count < 2;
  } else {
    selectionActionBar.classList.add("hidden");
  }
}

export function showDeleteModal(indices) {
  state.pendingDeleteIndices = indices;
  deleteModalCount.textContent = indices.length;
  deleteModal.classList.remove("hidden");
}

// ─── Squash via selection ───

squashSelectedBtn.addEventListener("click", () => {
  if (state.selectedCommits.size < 2) return;
  if (!state.gitClient || !state.currentDocId || !state.currentFilename) {
    showToast("squash unavailable");
    return;
  }
  const sorted = [...state.selectedCommits].sort((a, b) => a - b);
  const latestIndex = sorted[sorted.length - 1];
  const latestCommit = state.commitLog[latestIndex];
  squashModalCount.textContent = sorted.length;
  squashModalMessage.textContent = '"' + (latestCommit ? latestCommit.message : "") + '"';
  squashHelpText.classList.add("hidden");
  squashModal.classList.remove("hidden");
});

squashModalHelp.addEventListener("click", (e) => {
  e.preventDefault();
  squashHelpText.classList.toggle("hidden");
});

squashModalConfirm.addEventListener("click", async () => {
  squashModal.classList.add("hidden");
  const sorted = [...state.selectedCommits].sort((a, b) => a - b);
  const fromIndex = sorted[0];
  const toIndex = sorted[sorted.length - 1];
  const latestCommit = state.commitLog[toIndex];
  const message = latestCommit ? latestCommit.message : "";
  try {
    showToast("squashing\u2026");
    const result = await state.gitClient.squash({
      docId: state.currentDocId,
      filename: state.currentFilename,
      fromIndex,
      toIndex,
      message,
    });
    if (result && result.log) {
      exitNavMode();
      renderCommits(result.log);
      setEditorContent(result.content);
      showToast("squashed " + (toIndex - fromIndex + 1) + " snapshots into 1");
      if (state.syncClient) state.syncClient.fullSync();
    }
  } catch (err) {
    showToast("squash failed: " + err.message);
  } finally {
    clearSelection();
  }
});

squashModalCancel.addEventListener("click", () => {
  squashModal.classList.add("hidden");
});

// ─── Delete commits ───

deleteModalConfirm.addEventListener("click", async () => {
  deleteModal.classList.add("hidden");
  if (!state.pendingDeleteIndices || !state.gitClient || !state.currentDocId || !state.currentFilename) {
    showToast("delete unavailable");
    return;
  }
  const indices = state.pendingDeleteIndices;
  state.pendingDeleteIndices = null;
  try {
    showToast("deleting\u2026");
    const result = await state.gitClient.deleteCommits({
      docId: state.currentDocId,
      filename: state.currentFilename,
      indices,
    });
    if (result && result.log) {
      exitNavMode();
      renderCommits(result.log);
      setEditorContent(result.content);
      showToast("deleted " + indices.length + " snapshot" + (indices.length > 1 ? "s" : ""));
      if (state.syncClient) state.syncClient.fullSync();
    }
  } catch (err) {
    showToast("delete failed: " + err.message);
  } finally {
    clearSelection();
  }
});

deleteModalCancel.addEventListener("click", () => {
  deleteModal.classList.add("hidden");
  state.pendingDeleteIndices = null;
});

deleteSelectedBtn.addEventListener("click", () => {
  if (state.selectedCommits.size === 0) return;
  showDeleteModal([...state.selectedCommits]);
});

clearSelectionBtn.addEventListener("click", () => {
  clearSelection();
});
