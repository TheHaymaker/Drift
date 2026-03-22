import "./style.css";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import Playback from "./Playback.jsx";

// ─── Playback mount ───
let playbackRoot = null;
const playbackContainer = document.getElementById("playbackView");

function mountPlayback(docId) {
  document.getElementById("dashboardView").classList.add("hidden");
  document.getElementById("editorView").classList.add("hidden");
  document.getElementById("connStatus").classList.add("hidden");
  playbackContainer.classList.remove("hidden");
  document.title = "drift \u2014 playback";

  if (!playbackRoot) {
    playbackRoot = createRoot(playbackContainer);
  }
  playbackRoot.render(
    createElement(Playback, {
      docId,
      onBack: () => { location.hash = "#/"; },
    })
  );
}

function unmountPlayback() {
  playbackContainer.classList.add("hidden");
  if (playbackRoot) {
    playbackRoot.render(null);
  }
}

// ─── Auth ───
const authView = document.getElementById("authView");
const authForm = document.getElementById("authForm");
const authUsername = document.getElementById("authUsername");
const authPassword = document.getElementById("authPassword");
const authSubmit = document.getElementById("authSubmit");
const authToggle = document.getElementById("authToggle");
const authError = document.getElementById("authError");
const logoutBtn = document.getElementById("logoutBtn");
const dashboardSubtitle = document.getElementById("dashboardSubtitle");

let currentUser = null;
let authMode = "login"; // "login" or "register"

async function checkAuth() {
  try {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      currentUser = await res.json();
      return true;
    }
  } catch {}
  currentUser = null;
  return false;
}

function showAuth() {
  authView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
  editorView.classList.add("hidden");
  connStatus.classList.add("hidden");
  authError.textContent = "";
  authUsername.focus();
}

authToggle.addEventListener("click", () => {
  authMode = authMode === "login" ? "register" : "login";
  authSubmit.textContent = authMode === "login" ? "log in" : "register";
  authToggle.textContent = authMode === "login"
    ? "need an account? register"
    : "have an account? log in";
  authError.textContent = "";
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.textContent = "";
  const username = authUsername.value.trim().toLowerCase();
  const password = authPassword.value;
  if (!username || !password) { authError.textContent = "fill in both fields"; return; }
  try {
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { authError.textContent = data.error; return; }
    currentUser = data;
    authPassword.value = "";
    route();
  } catch {
    authError.textContent = "connection failed";
  }
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  currentUser = null;
  showAuth();
});

// ─── DOM refs ───
const dashboardView = document.getElementById("dashboardView");
const editorView = document.getElementById("editorView");
const connStatus = document.getElementById("connStatus");
const docList = document.getElementById("docList");
const newPoemBtn = document.getElementById("newPoemBtn");
const backBtn = document.getElementById("backBtn");
const editor = document.getElementById("editor");
const status = document.getElementById("status");
const filenameEl = document.getElementById("filename");
const commitList = document.getElementById("commitList");
const commitCountNum = document.getElementById("commitCountNum");
const thresholdSlider = document.getElementById("thresholdSlider");
const thresholdValue = document.getElementById("thresholdValue");
const forceCommitBtn = document.getElementById("forceCommitBtn");
const exportBtn = document.getElementById("exportBtn");
const pauseFill = document.getElementById("pauseFill");
const pauseLabel = document.getElementById("pauseLabel");
const connDot = document.getElementById("connDot");
const connLabel = document.getElementById("connLabel");
const toast = document.getElementById("toast");
const diffPanel = document.getElementById("diffPanel");
const diffTitle = document.getElementById("diffTitle");
const diffBody = document.getElementById("diffBody");
const diffClose = document.getElementById("diffClose");

let ws;
let currentDocId = null;
let pauseThreshold = 3000;
let lastKeystroke = 0;
let animFrame;
let isTyping = false;
let commitLog = [];

// ─── Router ───

function getRoute() {
  const hash = location.hash || "#/";
  const writeMatch = hash.match(/^#\/write\/(.+)$/);
  if (writeMatch) return { view: "write", docId: writeMatch[1] };
  const readMatch = hash.match(/^#\/read\/(.+)$/);
  if (readMatch) return { view: "read", docId: readMatch[1] };
  return { view: "dashboard" };
}

function navigate(hash) {
  location.hash = hash;
}

async function route() {
  if (!currentUser) {
    const authed = await checkAuth();
    if (!authed) { showAuth(); return; }
  }
  authView.classList.add("hidden");
  const r = getRoute();
  if (r.view === "read") {
    disconnectWs();
    currentDocId = null;
    unmountPlayback();
    mountPlayback(r.docId);
  } else {
    unmountPlayback();
    if (r.view === "write") {
      showEditor(r.docId);
    } else {
      showDashboard();
    }
  }
}

window.addEventListener("hashchange", route);

// ─── Dashboard ───

function showDashboard() {
  disconnectWs();
  currentDocId = null;
  dashboardView.classList.remove("hidden");
  editorView.classList.add("hidden");
  connStatus.classList.add("hidden");
  document.title = "drift";
  if (currentUser) {
    dashboardSubtitle.textContent = currentUser.username + "'s poems";
  }
  loadDocList();
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function loadDocList() {
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
      div.querySelector(".doc-item-info").addEventListener("click", () => navigate("#/write/" + doc.doc_id));
      div.querySelector(".doc-rename-btn").addEventListener("click", async (e) => {
        e.stopPropagation();
        const newTitle = prompt("rename poem:", doc.title || "untitled");
        if (newTitle === null || newTitle.trim() === "") return;
        const trimmed = newTitle.trim();
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
        }
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

function titleToFilename(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".txt";
}

newPoemBtn.addEventListener("click", async () => {
  const title = prompt("poem title:");
  if (title === null) return;
  const finalTitle = title.trim() || "untitled";
  const filename = finalTitle === "untitled" ? "poem.txt" : titleToFilename(finalTitle);
  try {
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: finalTitle, filename }),
    });
    const data = await res.json();
    navigate("#/write/" + data.docId);
  } catch (e) {
    showToast("failed to create poem");
  }
});

backBtn.addEventListener("click", () => navigate("#/"));

// ─── Editor ───

function showEditor(docId, readOnly) {
  if (currentDocId === docId && ws && ws.readyState === 1) return;
  currentDocId = docId;
  dashboardView.classList.add("hidden");
  editorView.classList.remove("hidden");
  connStatus.classList.remove("hidden");
  editor.readOnly = !!readOnly;
  editor.placeholder = readOnly
    ? "reading..."
    : "begin writing. drift commits when you pause.";
  document.title = "drift \u2014 writing";
  connectWs(docId);
}

function disconnectWs() {
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
}

function connectWs(docId) {
  disconnectWs();
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onopen = () => {
    connDot.className = "connection-dot connected";
    connLabel.textContent = "connected";
    status.textContent = "joining";
    status.className = "status-pill";
    ws.send(JSON.stringify({ type: "join", docId }));
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    if (msg.type === "init") {
      editor.value = msg.content;
      filenameEl.textContent = msg.filename;
      pauseThreshold = msg.pauseThreshold;
      thresholdSlider.value = pauseThreshold;
      thresholdValue.textContent = (pauseThreshold / 1000).toFixed(1) + "s";
      renderCommits(msg.log);
      status.textContent = "ready";
      status.className = "status-pill";
      if (!editor.readOnly) editor.focus();
    }

    if (msg.type === "committed") {
      status.textContent = "committed " + msg.hash;
      status.className = "status-pill committed";
      renderCommits(msg.log, msg.hash);
      showToast(msg.hash + " \u2014 " + msg.message);
      setTimeout(() => {
        status.textContent = "ready";
        status.className = "status-pill";
      }, 2000);
    }

    if (msg.type === "threshold-changed") {
      pauseThreshold = msg.value;
      thresholdSlider.value = msg.value;
      thresholdValue.textContent = (msg.value / 1000).toFixed(1) + "s";
    }

    if (msg.type === "renamed") {
      filenameEl.textContent = msg.filename;
      showToast("renamed to " + msg.filename);
    }

    if (msg.type === "deleted") {
      showToast("this poem has been deleted");
      navigate("#/");
    }

    if (msg.type === "error") {
      showToast(msg.message);
    }
  };

  ws.onclose = () => {
    connDot.className = "connection-dot disconnected";
    connLabel.textContent = "disconnected";
    status.textContent = "offline";
    status.className = "status-pill";
    if (getRoute().docId === docId) {
      setTimeout(() => connectWs(docId), 3000);
    }
  };

  ws.onerror = () => ws.close();
}

// ─── Pause ring ───

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function updateRing() {
  const now = Date.now();
  const elapsed = now - lastKeystroke;

  if (isTyping && elapsed < pauseThreshold) {
    const progress = elapsed / pauseThreshold;
    const offset = 88 * (1 - progress);
    pauseFill.style.strokeDashoffset = offset;
    pauseFill.classList.add("active");
    pauseLabel.textContent = ((pauseThreshold - elapsed) / 1000).toFixed(1) + "s \u2192 commit";
  } else if (isTyping && elapsed >= pauseThreshold) {
    pauseFill.style.strokeDashoffset = 0;
    isTyping = false;
  } else {
    pauseFill.style.strokeDashoffset = 88;
    pauseFill.classList.remove("active");
    pauseLabel.textContent = "pause \u2192 commit";
  }

  animFrame = requestAnimationFrame(updateRing);
}
animFrame = requestAnimationFrame(updateRing);

// ─── Commits ───

function renderCommits(log, newHash) {
  commitLog = log;
  commitCountNum.textContent = log.length;
  commitList.innerHTML = "";

  const reversed = [...log].reverse();
  for (const c of reversed) {
    const div = document.createElement("div");
    div.className = "commit-item" + (c.hash === newHash ? " new" : "");
    div.innerHTML =
      '<div class="commit-hash">' + c.hash + '</div>' +
      '<div class="commit-msg">' + escapeHtml(c.message) + '</div>' +
      '<div class="commit-time">#' + (c.index + 1) + '</div>';
    div.addEventListener("click", () => {
      document.querySelectorAll(".commit-item").forEach(el => el.classList.remove("active"));
      div.classList.add("active");

      // Fetch snapshot
      fetch("/api/documents/" + currentDocId + "/snapshot/" + c.hash)
        .then(r => r.json())
        .then(d => {
          editor.value = d.content;
          showToast("viewing " + c.hash);
        });

      // Fetch and show diff if there's a previous commit
      if (c.index > 0) {
        const prev = log[c.index - 1];
        fetchAndShowDiff(prev.hash, c.hash, c);
      } else {
        // First commit — show it as all-added
        showFirstCommitDiff(c.hash, c);
      }
    });
    commitList.appendChild(div);
  }
}

// ─── Diff panel ───

function fetchAndShowDiff(hashA, hashB, commit) {
  fetch("/api/documents/" + currentDocId + "/structured-diff/" + hashA + "/" + hashB)
    .then(r => r.json())
    .then(d => {
      renderDiff(d.segments, commit);
    })
    .catch(() => {
      diffPanel.classList.add("hidden");
    });
}

function showFirstCommitDiff(hash, commit) {
  fetch("/api/documents/" + currentDocId + "/snapshot/" + hash)
    .then(r => r.json())
    .then(d => {
      const segments = d.content
        ? [{ type: "added", text: d.content }]
        : [];
      renderDiff(segments, commit);
    });
}

function renderDiff(segments, commit) {
  if (!segments || segments.length === 0) {
    diffPanel.classList.add("hidden");
    return;
  }

  diffTitle.textContent = commit.hash + " — " + commit.message;
  diffBody.innerHTML = "";

  for (const seg of segments) {
    const span = document.createElement("span");
    span.className = "diff-seg diff-" + seg.type;
    span.textContent = seg.text;
    diffBody.appendChild(span);
  }

  diffPanel.classList.remove("hidden");
}

function closeDiff() {
  diffPanel.classList.add("hidden");
}

diffClose.addEventListener("click", closeDiff);

// ─── Editor events ───

editor.addEventListener("input", () => {
  if (editor.readOnly) return;
  lastKeystroke = Date.now();
  isTyping = true;
  status.textContent = "writing";
  status.className = "status-pill typing";

  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "update", content: editor.value }));
  }
});

editor.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const start = editor.selectionStart;
    editor.value = editor.value.slice(0, start) + "  " + editor.value.slice(editor.selectionEnd);
    editor.selectionStart = editor.selectionEnd = start + 2;
    editor.dispatchEvent(new Event("input"));
  }
});

thresholdSlider.addEventListener("input", () => {
  const val = parseInt(thresholdSlider.value);
  thresholdValue.textContent = (val / 1000).toFixed(1) + "s";
  pauseThreshold = val;
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "set-threshold", value: val }));
  }
});

forceCommitBtn.addEventListener("click", () => {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "force-commit" }));
  }
});

document.getElementById("playbackBtn").addEventListener("click", () => {
  if (currentDocId) navigate("#/read/" + currentDocId);
});

exportBtn.addEventListener("click", async () => {
  if (!currentDocId) return;
  try {
    const log = await fetch("/api/documents/" + currentDocId + "/log").then(r => r.json());
    const snapshots = [];
    for (const c of log) {
      const snap = await fetch("/api/documents/" + currentDocId + "/snapshot/" + c.hash).then(r => r.json());
      snapshots.push({ ...c, content: snap.content });
    }
    const blob = new Blob([JSON.stringify(snapshots, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drift-export-" + Date.now() + ".json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("exported " + log.length + " snapshots");
  } catch (e) {
    showToast("export failed");
  }
});

editor.addEventListener("blur", () => {
  status.textContent = "paused";
  status.className = "status-pill paused";
});

editor.addEventListener("focus", () => {
  if (!currentDocId) return;
  document.querySelectorAll(".commit-item").forEach(el => el.classList.remove("active"));
  closeDiff();
  if (ws && ws.readyState === 1) {
    fetch("/api/documents/" + currentDocId + "/file").then(r => r.json()).then(d => {
      editor.value = d.content;
    });
  }
  status.textContent = "ready";
  status.className = "status-pill";
});

// ─── Init: route on load ───
route();
