// src/editor/commit-list.js
import { state } from '../state.js';
import { showToast } from '../toast.js';
import { escapeHtml } from '../views/dashboard.js';
import { updateSelectionUI, clearSelection, showDeleteModal } from './selection.js';

// Lazy handler for loadSnapshot to break circular dep with history-nav.js
let _loadSnapshot = null;
export function setCommitListHandlers({ loadSnapshot }) {
  _loadSnapshot = loadSnapshot;
}

const commitList = document.getElementById("commitList");
const commitCountNum = document.getElementById("commitCountNum");

export function createCommitItem(c, isNew, log) {
  const div = document.createElement("div");
  let cls = "commit-item";
  if (isNew) cls += " new";
  if (state.historyPosition >= 0 && c.index === state.historyPosition) cls += " viewing";
  if (state.selectedCommits.has(c.index)) cls += " selected";
  div.className = cls;
  div.dataset.hash = c.hash;
  div.dataset.index = c.index;
  div.draggable = true;
  const logLen = log ? log.length : state.commitLog.length;
  div.innerHTML =
    '<div class="commit-hash">' + c.hash + '</div>' +
    '<div class="commit-msg">' + escapeHtml(c.message) + '</div>' +
    '<div class="commit-time">#' + (c.index + 1) + '</div>' +
    '<div class="commit-actions">' +
      (c.index < logLen - 1 ? '<button class="commit-revert-btn">revert</button>' : '') +
      (logLen > 1 ? '<button class="commit-delete-btn">delete</button>' : '') +
    '</div>';
  return div;
}

export function renderCommits(log, newHash) {
  state.commitLog = log;
  commitCountNum.textContent = log.length;

  // Update undo/redo button states — imported lazily to avoid circular dep
  _updateNavButtons();

  // Incremental update: prepend only the new commit (skip when selecting/nav mode)
  if (newHash && commitList.children.length > 0 && state.selectedCommits.size === 0 && state.historyPosition === -1) {
    const c = log.find(entry => entry.hash === newHash);
    if (c) {
      commitList.prepend(createCommitItem(c, true, log));
      return;
    }
  }

  // Full rebuild with DocumentFragment
  const fragment = document.createDocumentFragment();
  const reversed = [...log].reverse();
  for (const c of reversed) {
    fragment.appendChild(createCommitItem(c, c.hash === newHash, log));
  }
  commitList.innerHTML = "";
  commitList.appendChild(fragment);
}

// Lazy nav button updater (history-nav calls renderCommits, renderCommits needs updateNavButtons)
let _updateNavButtonsFn = null;
export function setNavButtonUpdater(fn) {
  _updateNavButtonsFn = fn;
}
function _updateNavButtons() {
  if (_updateNavButtonsFn) _updateNavButtonsFn();
}

// Event delegation — single click listener on commit list
commitList.addEventListener("click", async (e) => {
  // Handle revert button clicks
  if (e.target.classList.contains("commit-revert-btn")) {
    e.stopPropagation();
    const item = e.target.closest(".commit-item");
    if (!item) return;
    const index = parseInt(item.dataset.index, 10);
    const c = state.commitLog[index];
    if (c) {
      const { revertToCommit } = await import('../views/editor.js');
      await revertToCommit(c);
    }
    return;
  }

  // Handle inline delete button clicks
  if (e.target.classList.contains("commit-delete-btn")) {
    e.stopPropagation();
    const item = e.target.closest(".commit-item");
    if (!item) return;
    const index = parseInt(item.dataset.index, 10);
    showDeleteModal([index]);
    return;
  }

  const item = e.target.closest(".commit-item");
  if (!item) return;

  const index = parseInt(item.dataset.index, 10);

  // Multi-select: Ctrl/Cmd+Click toggles individual, Shift+Click selects range
  if (e.ctrlKey || e.metaKey) {
    if (state.selectedCommits.has(index)) {
      state.selectedCommits.delete(index);
    } else {
      state.selectedCommits.add(index);
    }
    state.lastSelectedIndex = index;
    updateSelectionUI();
    renderCommits(state.commitLog);
    return;
  }

  if (e.shiftKey && state.lastSelectedIndex !== null) {
    const lo = Math.min(state.lastSelectedIndex, index);
    const hi = Math.max(state.lastSelectedIndex, index);
    for (let i = lo; i <= hi; i++) {
      state.selectedCommits.add(i);
    }
    updateSelectionUI();
    renderCommits(state.commitLog);
    return;
  }

  // Plain click: clear selection and navigate
  if (state.selectedCommits.size > 0) {
    clearSelection();
  }

  // Navigate to this commit
  state.historyPosition = index;
  const { updateNavUI } = await import('./history-nav.js');
  updateNavUI();
  if (_loadSnapshot) await _loadSnapshot(state.commitLog[index]);
});

// Drag-and-drop delegation on commit list
commitList.addEventListener("dragstart", (e) => {
  const item = e.target.closest(".commit-item");
  if (!item) return;
  const index = parseInt(item.dataset.index, 10);
  state.dragSourceIndex = index;
  item.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(index));
});

commitList.addEventListener("dragend", (e) => {
  const item = e.target.closest(".commit-item");
  if (item) item.classList.remove("dragging");
  state.dragSourceIndex = null;
  document.querySelectorAll(".commit-item").forEach(el => {
    el.classList.remove("drag-over-top", "drag-over-bottom");
  });
});

commitList.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const item = e.target.closest(".commit-item");
  if (!item) return;
  const rect = item.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  document.querySelectorAll(".commit-item").forEach(el => {
    el.classList.remove("drag-over-top", "drag-over-bottom");
  });
  if (e.clientY < midY) {
    item.classList.add("drag-over-top");
  } else {
    item.classList.add("drag-over-bottom");
  }
});

commitList.addEventListener("dragleave", (e) => {
  const item = e.target.closest(".commit-item");
  if (item) item.classList.remove("drag-over-top", "drag-over-bottom");
});

commitList.addEventListener("drop", async (e) => {
  e.preventDefault();
  document.querySelectorAll(".commit-item").forEach(el => {
    el.classList.remove("drag-over-top", "drag-over-bottom");
  });
  const item = e.target.closest(".commit-item");
  if (!item) return;
  const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
  const targetIndex = parseInt(item.dataset.index, 10);
  const rect = item.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  let toIndex = e.clientY < midY ? targetIndex + 1 : targetIndex;
  if (fromIndex === toIndex || fromIndex === toIndex - 1) return;
  const { reorderCommit } = await import('../views/editor.js');
  await reorderCommit(fromIndex, toIndex);
});
