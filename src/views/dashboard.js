// src/views/dashboard.js
import { state } from '../state.js';
import { showToast } from '../toast.js';
import { dashboardSubtitle } from '../auth.js';

// Lazy imports to avoid circular dep: router → dashboard → router
let _navigate = (hash) => { location.hash = hash; };
import('../router.js').then(m => { _navigate = m.navigate; });
function navigate(hash) { _navigate(hash); }

// Lazy import to avoid circular dep: router → dashboard → editor → router
let _disconnectWs = () => {};
import('./editor.js').then(m => { _disconnectWs = m.disconnectWs; });
function disconnectWs() { _disconnectWs(); }

export const POEM_ADJECTIVES = [
  "silver", "quiet", "amber", "hollow", "velvet",
  "ancient", "drifting", "woven", "fading", "luminous",
  "gentle", "wild", "distant", "trembling", "golden",
  "frozen", "restless", "solitary", "tangled", "dusky"
];

export const POEM_NOUNS = [
  "dawn", "harbor", "thread", "ember", "shore",
  "echo", "meadow", "lantern", "river", "ghost",
  "hymn", "shadow", "garden", "stillness", "tide",
  "passage", "vessel", "bloom", "reverie", "stone"
];

export function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function titleToFilename(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".txt";
}

export function generatePoemName() {
  const adj = POEM_ADJECTIVES[Math.floor(Math.random() * POEM_ADJECTIVES.length)];
  const noun = POEM_NOUNS[Math.floor(Math.random() * POEM_NOUNS.length)];
  return adj + " " + noun;
}

export function startInlineRename(titleSpan, doc) {
  if (titleSpan.querySelector("input")) return;
  const currentTitle = doc.title || "untitled";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "doc-title-input";
  input.value = currentTitle;
  titleSpan.textContent = "";
  titleSpan.appendChild(input);
  input.focus();
  input.select();
  let saved = false;
  async function save() {
    if (saved) return;
    saved = true;
    const trimmed = input.value.trim();
    if (!trimmed || trimmed === currentTitle) {
      titleSpan.textContent = currentTitle;
      return;
    }
    const newFilename = titleToFilename(trimmed);
    try {
      await fetch("/api/documents/" + doc.doc_id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, filename: newFilename }),
      });
      loadDocList();
      showToast("renamed to " + trimmed);
    } catch (e) {
      showToast("rename failed");
      titleSpan.textContent = currentTitle;
    }
  }
  function cancel() {
    if (saved) return;
    saved = true;
    titleSpan.textContent = currentTitle;
  }
  input.addEventListener("blur", save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    else if (e.key === "Escape") { e.preventDefault(); cancel(); }
  });
}

export function showDashboard() {
  disconnectWs();
  state.currentDocId = null;
  document.getElementById("landingView").classList.add("hidden");
  document.getElementById("dashboardView").classList.remove("hidden");
  document.getElementById("editorView").classList.add("hidden");
  document.getElementById("settingsView").classList.add("hidden");
  document.getElementById("connStatus").classList.add("hidden");
  document.title = "drift";
  if (state.currentUser) {
    dashboardSubtitle.textContent = state.currentUser.username + "'s poems";
  }
  loadDocList();
}

export async function loadDocList() {
  const docList = document.getElementById("docList");
  try {
    const docs = await fetch("/api/documents").then(r => r.json());
    docList.innerHTML = "";
    if (docs.length === 0) {
      docList.innerHTML = '<div class="doc-empty">no poems yet. start one.</div>';
      return;
    }
    for (const doc of docs) {
      const div = document.createElement("div");
      div.className = "doc-item";
      const modified = doc.last_modified ? new Date(doc.last_modified + "Z").toLocaleDateString() : "";
      div.innerHTML = `
        <div class="doc-item-info">
          <span class="doc-item-title">${escapeHtml(doc.title || "untitled")}</span>
          <span class="doc-item-meta">${escapeHtml(doc.filename)} &middot; ${modified}</span>
        </div>
        <div class="doc-item-actions">
          <button class="doc-action-btn doc-rename-btn" title="rename">&#9998;</button>
          <button class="doc-action-btn doc-delete-btn" title="delete">&times;</button>
          <button class="doc-action-btn doc-play-btn" title="play back">&#9654;</button>
        </div>
      `;
      const titleSpan = div.querySelector(".doc-item-title");
      titleSpan.addEventListener("click", (e) => {
        e.stopPropagation();
        startInlineRename(titleSpan, doc);
      });
      div.querySelector(".doc-item-info").addEventListener("click", () => navigate("#/write/" + doc.doc_id));
      div.querySelector(".doc-rename-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        startInlineRename(titleSpan, doc);
      });
      div.querySelector(".doc-delete-btn").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("delete \"" + (doc.title || "untitled") + "\"? this cannot be undone.")) return;
        try {
          await fetch("/api/documents/" + doc.doc_id, { method: "DELETE" });
          loadDocList();
          showToast("deleted");
        } catch (e) {
          showToast("delete failed");
        }
      });
      div.querySelector(".doc-play-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        navigate("#/read/" + doc.doc_id);
      });
      docList.appendChild(div);
    }
  } catch (e) {
    docList.innerHTML = '<div class="doc-empty">failed to load documents</div>';
  }
}

// Top-level event listeners
const newPoemBtn = document.getElementById("newPoemBtn");
const backBtn = document.getElementById("backBtn");

newPoemBtn.addEventListener("click", async () => {
  const finalTitle = generatePoemName();
  const filename = titleToFilename(finalTitle);
  try {
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: finalTitle, filename }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "failed to create poem");
      return;
    }
    const data = await res.json();
    navigate("#/write/" + data.docId);
  } catch (e) {
    showToast("failed to create poem");
  }
});

backBtn.addEventListener("click", () => navigate("#/poems"));
