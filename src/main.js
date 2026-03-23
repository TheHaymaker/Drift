import "./style.css";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import Playback from "./Playback.jsx";
import { createGitClient } from "./git-client.js";
import { createSyncClient } from "./sync.js";

// ─── Browser git capability detection ───
const canUseLocalGit =
  typeof Worker !== "undefined" && typeof indexedDB !== "undefined";

let gitClient = null;
let syncClient = null;
let currentFilename = null;

// ─── Playback mount ───
let playbackRoot = null;
const playbackContainer = document.getElementById("playbackView");

function mountPlayback(docId) {
  document.getElementById("landingView").classList.add("hidden");
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
      onBack: () => { location.hash = "#/poems"; },
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
let pendingRoute = null;

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
  landingView.classList.add("hidden");
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
    if (pendingRoute) {
      const dest = pendingRoute;
      pendingRoute = null;
      location.hash = dest;
    } else {
      location.hash = "#/poems";
    }
    route();
  } catch {
    authError.textContent = "connection failed";
  }
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  currentUser = null;
  location.hash = "#/";
  route();
});

// ─── DOM refs ───
const landingView = document.getElementById("landingView");
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
  if (hash === "#/poems") return { view: "dashboard" };
  return { view: "landing" };
}

function navigate(hash) {
  location.hash = hash;
}

async function route() {
  // Always check auth status (but don't block on it)
  if (!currentUser) {
    await checkAuth();
  }

  const r = getRoute();
  stopTypingAnimation();

  // Landing page is always accessible
  if (r.view === "landing") {
    authView.classList.add("hidden");
    unmountPlayback();
    showLanding();
    return;
  }

  // All other views require auth
  if (!currentUser) {
    // Remember where user wanted to go after login
    pendingRoute = location.hash;
    showAuth();
    return;
  }

  authView.classList.add("hidden");
  if (r.view === "read") {
    disconnectWs();
    currentDocId = null;
    unmountPlayback();
    mountPlayback(r.docId);
  } else {
    unmountPlayback();
    if (r.view === "write") {
      showEditor(r.docId);
    } else if (r.view === "dashboard") {
      showDashboard();
    } else {
      showLanding();
    }
  }
}

window.addEventListener("hashchange", route);

// ─── Landing ───

let typingTimer = null;

const typingPoem = [
  "The water remembers the sky,",
  "The shadows hold the heat of the day,",
  "And we are but ghosts in the garden.",
];

function stopTypingAnimation() {
  if (typingTimer) {
    clearTimeout(typingTimer);
    typingTimer = null;
  }
  destroyDemo();
}

function startTypingAnimation() {
  const container = document.getElementById("typingLines");
  if (!container) return;
  container.innerHTML = "";

  let lineIdx = 0;
  let charIdx = 0;
  let currentLineEl = null;

  function tick() {
    if (lineIdx >= typingPoem.length) {
      // Add blinking cursor to last line
      if (currentLineEl) {
        const cursor = document.createElement("span");
        cursor.className = "typing-cursor";
        cursor.textContent = "|";
        currentLineEl.appendChild(cursor);
      }
      return;
    }

    if (charIdx === 0) {
      currentLineEl = document.createElement("p");
      currentLineEl.className = "typing-line";
      container.appendChild(currentLineEl);
    }

    const line = typingPoem[lineIdx];
    currentLineEl.textContent = line.slice(0, charIdx + 1);
    charIdx++;

    if (charIdx >= line.length) {
      lineIdx++;
      charIdx = 0;
      typingTimer = setTimeout(tick, 400);
    } else {
      typingTimer = setTimeout(tick, 50 + Math.random() * 40);
    }
  }

  typingTimer = setTimeout(tick, 800);
}

function showLanding() {
  disconnectWs();
  currentDocId = null;
  landingView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
  editorView.classList.add("hidden");
  connStatus.classList.add("hidden");
  document.title = "drift \u2014 where every pause is a verse";
  updateLandingNav();
  startTypingAnimation();
  initDemo();
}

// ─── Interactive Demo ───

let demoLastKeystroke = 0;
let demoIsTyping = false;
let demoAnimFrame = null;
let demoCommits = [];
let demoPrevWordCount = 0;
const demoThreshold = 2500;
let demoInputHandler = null;

function wordCount(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function demoHash() {
  return Math.random().toString(16).slice(2, 9);
}

function initDemo() {
  destroyDemo();

  const demoEditor = document.getElementById("demoEditor");
  const demoFill = document.getElementById("demoFill");
  const demoRingLabel = document.getElementById("demoRingLabel");
  const demoStatus = document.getElementById("demoStatus");
  const demoCommitsEl = document.getElementById("demoCommits");
  const demoCommitCount = document.getElementById("demoCommitCount");
  const demoHint = document.getElementById("demoHint");
  const demoToast = document.getElementById("demoToast");

  if (!demoEditor) return;

  demoCommits = [];
  demoPrevWordCount = 0;
  demoIsTyping = false;
  demoLastKeystroke = 0;
  demoEditor.value = "";
  demoCommitsEl.innerHTML = '<div class="demo-empty">your snapshots will appear here.</div>';
  demoCommitCount.textContent = "0";
  demoStatus.textContent = "ready";
  demoStatus.className = "status-pill";
  demoFill.style.strokeDashoffset = 88;
  demoRingLabel.textContent = "pause \u2192 commit";
  demoHint.textContent = "";

  demoInputHandler = () => {
    demoLastKeystroke = Date.now();
    demoIsTyping = true;
    demoStatus.textContent = "writing";
    demoStatus.className = "status-pill typing";
  };

  demoEditor.addEventListener("input", demoInputHandler);

  function showDemoToast(msg) {
    demoToast.textContent = msg;
    demoToast.classList.add("show");
    setTimeout(() => demoToast.classList.remove("show"), 2200);
  }

  function demoCommit() {
    const content = demoEditor.value;
    const wc = wordCount(content);
    const hash = demoHash();
    let message;

    if (demoCommits.length === 0) {
      message = "first draft";
    } else {
      const diff = wc - demoPrevWordCount;
      if (diff > 0) message = "+" + diff + " words";
      else if (diff < 0) message = diff + " words";
      else message = "revised";
    }

    demoPrevWordCount = wc;
    const commit = { hash, message, index: demoCommits.length };
    demoCommits.push(commit);

    // Update commit count
    demoCommitCount.textContent = demoCommits.length;

    // Clear empty state and prepend commit
    const emptyEl = demoCommitsEl.querySelector(".demo-empty");
    if (emptyEl) emptyEl.remove();

    const div = document.createElement("div");
    div.className = "demo-commit-item new";
    div.innerHTML =
      '<div class="demo-commit-hash">' + hash + '</div>' +
      '<div class="demo-commit-msg">' + message + '</div>';
    demoCommitsEl.prepend(div);

    // Status pill flash
    demoStatus.textContent = "committed " + hash;
    demoStatus.className = "status-pill committed";
    setTimeout(() => {
      demoStatus.textContent = "ready";
      demoStatus.className = "status-pill";
    }, 2000);

    // Toast
    showDemoToast(hash + " \u2014 " + message);

    // Coaching hints
    const count = demoCommits.length;
    if (count === 1) {
      demoHint.textContent = "Your first snapshot! Keep going\u2026";
    } else if (count === 2) {
      demoHint.textContent = "See how each pause captures your progress?";
    } else if (count === 3) {
      demoHint.textContent = "Every pause is a verse.";
    }
  }

  function updateDemoRing() {
    const now = Date.now();
    const elapsed = now - demoLastKeystroke;

    if (demoIsTyping && elapsed < demoThreshold) {
      const progress = elapsed / demoThreshold;
      const offset = 88 * (1 - progress);
      demoFill.style.strokeDashoffset = offset;
      demoRingLabel.textContent = ((demoThreshold - elapsed) / 1000).toFixed(1) + "s \u2192 commit";
    } else if (demoIsTyping && elapsed >= demoThreshold) {
      demoFill.style.strokeDashoffset = 0;
      demoIsTyping = false;
      demoCommit();
    } else {
      demoFill.style.strokeDashoffset = 88;
      demoRingLabel.textContent = "pause \u2192 commit";
    }

    demoAnimFrame = requestAnimationFrame(updateDemoRing);
  }

  demoAnimFrame = requestAnimationFrame(updateDemoRing);
}

function destroyDemo() {
  if (demoAnimFrame) {
    cancelAnimationFrame(demoAnimFrame);
    demoAnimFrame = null;
  }
  if (demoInputHandler) {
    const demoEditor = document.getElementById("demoEditor");
    if (demoEditor) demoEditor.removeEventListener("input", demoInputHandler);
    demoInputHandler = null;
  }
  demoCommits = [];
  demoPrevWordCount = 0;
  demoIsTyping = false;
}

function updateLandingNav() {
  const signInLink = document.getElementById("landingSignInLink");
  if (signInLink) {
    if (currentUser) {
      signInLink.style.display = "none";
    } else {
      signInLink.style.display = "";
      signInLink.textContent = "Log In / Sign Up";
    }
  }
}

// ─── Dashboard ───

function showDashboard() {
  disconnectWs();
  currentDocId = null;
  landingView.classList.add("hidden");
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

function titleToFilename(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".txt";
}

const POEM_ADJECTIVES = [
  "silver", "quiet", "amber", "hollow", "velvet",
  "ancient", "drifting", "woven", "fading", "luminous",
  "gentle", "wild", "distant", "trembling", "golden",
  "frozen", "restless", "solitary", "tangled", "dusky"
];

const POEM_NOUNS = [
  "dawn", "harbor", "thread", "ember", "shore",
  "echo", "meadow", "lantern", "river", "ghost",
  "hymn", "shadow", "garden", "stillness", "tide",
  "passage", "vessel", "bloom", "reverie", "stone"
];

function generatePoemName() {
  const adj = POEM_ADJECTIVES[Math.floor(Math.random() * POEM_ADJECTIVES.length)];
  const noun = POEM_NOUNS[Math.floor(Math.random() * POEM_NOUNS.length)];
  return adj + " " + noun;
}

function startInlineRename(titleSpan, doc) {
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

backBtn.addEventListener("click", () => navigate("#/"));

// ─── Editor ───

function showEditor(docId, readOnly) {
  if (currentDocId === docId && ws && ws.readyState === 1) return;
  currentDocId = docId;
  landingView.classList.add("hidden");
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
  destroyLocalGit();
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
      currentFilename = msg.filename;
      filenameEl.textContent = msg.filename;
      pauseThreshold = msg.pauseThreshold;
      thresholdSlider.value = pauseThreshold;
      thresholdValue.textContent = (pauseThreshold / 1000).toFixed(1) + "s";
      renderCommits(msg.log);
      status.textContent = "ready";
      status.className = "status-pill";
      if (!editor.readOnly) editor.focus();

      // Initialize browser-side git
      if (canUseLocalGit) {
        initLocalGit(docId, msg.filename, msg.content, msg.log);
      }
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
      navigate("#/poems");
    }

    if (msg.type === "error") {
      showToast(msg.message);
    }
  };

  ws.onclose = () => {
    if (gitClient) {
      connDot.className = "connection-dot offline-local";
      connLabel.textContent = "offline (local)";
      status.textContent = "ready";
      status.className = "status-pill";
    } else {
      connDot.className = "connection-dot disconnected";
      connLabel.textContent = "disconnected";
      status.textContent = "offline";
      status.className = "status-pill";
    }
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
    div.addEventListener("click", async () => {
      document.querySelectorAll(".commit-item").forEach(el => el.classList.remove("active"));
      div.classList.add("active");

      // Fetch snapshot — prefer local git
      if (gitClient && currentDocId && currentFilename) {
        try {
          const snap = await gitClient.getFileAt({ docId: currentDocId, filename: currentFilename, hash: c.hash });
          editor.value = snap.content;
          showToast("viewing " + c.hash);
        } catch {
          // Fall back to server
          const d = await fetch("/api/documents/" + currentDocId + "/snapshot/" + c.hash).then(r => r.json());
          editor.value = d.content;
          showToast("viewing " + c.hash);
        }
      } else {
        fetch("/api/documents/" + currentDocId + "/snapshot/" + c.hash)
          .then(r => r.json())
          .then(d => {
            editor.value = d.content;
            showToast("viewing " + c.hash);
          });
      }

      // Fetch and show diff — prefer local git
      if (c.index > 0) {
        const prev = log[c.index - 1];
        if (gitClient && currentDocId && currentFilename) {
          try {
            const diffResult = await gitClient.getStructuredDiff({ docId: currentDocId, filename: currentFilename, hashA: prev.hash, hashB: c.hash });
            renderDiff(diffResult.segments, c);
          } catch {
            fetchAndShowDiff(prev.hash, c.hash, c);
          }
        } else {
          fetchAndShowDiff(prev.hash, c.hash, c);
        }
      } else {
        if (gitClient && currentDocId && currentFilename) {
          try {
            const snap = await gitClient.getFileAt({ docId: currentDocId, filename: currentFilename, hash: c.hash });
            renderDiff(snap.content ? [{ type: "added", text: snap.content }] : [], c);
          } catch {
            showFirstCommitDiff(c.hash, c);
          }
        } else {
          showFirstCommitDiff(c.hash, c);
        }
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

// ─── Browser-side git initialization ───

async function initLocalGit(docId, filename, serverContent, serverLog) {
  destroyLocalGit();
  gitClient = createGitClient();

  try {
    const initResult = await gitClient.init({ docId, filename });

    // If repo was just created and server has history, clone it
    if (!initResult.existing && serverLog && serverLog.length > 0) {
      // Fetch full commit data from server for clone
      const res = await fetch(`/api/documents/${docId}/sync/clone`);
      if (res.ok) {
        const data = await res.json();
        if (data.commits && data.commits.length > 0) {
          await gitClient.clone({ docId, filename, commits: data.commits });
        }
      }
    } else if (initResult.existing) {
      // Existing local repo — write current content to match server
      await gitClient.writeFile({ docId, filename, content: serverContent });
    }

    // Set threshold to match
    await gitClient.setThreshold({ docId, value: pauseThreshold });

    // Initialize sync client
    syncClient = createSyncClient(docId, filename, gitClient);

    // Listen for local commits (from pause timer in worker)
    gitClient.onCommit(async (data) => {
      // Update UI from local git
      const logResult = await gitClient.getLog({ docId });
      renderCommits(logResult.log, data.hash);
      showToast(data.hash + " \u2014 " + data.message);
      status.textContent = "committed " + data.hash;
      status.className = "status-pill committed";
      setTimeout(() => {
        status.textContent = "ready";
        status.className = "status-pill";
      }, 2000);

      // Queue sync push
      if (syncClient) syncClient.pushCommit(data);
    });

    console.log("[drift] browser git ready for", docId);
  } catch (err) {
    console.error("[drift] browser git init failed:", err);
    gitClient = null;
  }
}

function destroyLocalGit() {
  if (syncClient) {
    syncClient.destroy();
    syncClient = null;
  }
  if (gitClient) {
    gitClient.destroy();
    gitClient = null;
  }
}

// ─── Editor events ───

editor.addEventListener("input", () => {
  if (editor.readOnly) return;
  lastKeystroke = Date.now();
  isTyping = true;
  status.textContent = "writing";
  status.className = "status-pill typing";

  if (gitClient && currentDocId && currentFilename) {
    // Write to local git (pause timer in worker handles commits)
    gitClient.writeFile({
      docId: currentDocId,
      filename: currentFilename,
      content: editor.value,
    });
    // Send lightweight typing indicator over WebSocket
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "typing", length: editor.value.length }));
    }
  } else {
    // Fallback: send full content over WebSocket (original path)
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "update", content: editor.value }));
    }
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
  if (gitClient && currentDocId) {
    gitClient.setThreshold({ docId: currentDocId, value: val });
  }
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "set-threshold", value: val }));
  }
});

forceCommitBtn.addEventListener("click", async () => {
  if (gitClient && currentDocId && currentFilename) {
    const result = await gitClient.forceCommit({
      docId: currentDocId,
      filename: currentFilename,
    });
    if (result && !result.noChange) {
      const logResult = await gitClient.getLog({ docId: currentDocId });
      renderCommits(logResult.log, result.hash);
      showToast(result.hash + " \u2014 " + result.message);
      if (syncClient) syncClient.pushCommit(result);
    }
  } else if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "force-commit" }));
  }
});

document.getElementById("playbackBtn").addEventListener("click", () => {
  if (currentDocId) navigate("#/read/" + currentDocId);
});

exportBtn.addEventListener("click", async () => {
  if (!currentDocId) return;
  try {
    let snapshots;
    if (gitClient && currentFilename) {
      // Export from local git
      const logResult = await gitClient.getLog({ docId: currentDocId });
      snapshots = [];
      for (const c of logResult.log) {
        const snap = await gitClient.getFileAt({ docId: currentDocId, filename: currentFilename, hash: c.hash });
        snapshots.push({ ...c, content: snap.content });
      }
    } else {
      // Export from server
      const log = await fetch("/api/documents/" + currentDocId + "/log").then(r => r.json());
      snapshots = [];
      for (const c of log) {
        const snap = await fetch("/api/documents/" + currentDocId + "/snapshot/" + c.hash).then(r => r.json());
        snapshots.push({ ...c, content: snap.content });
      }
    }
    const blob = new Blob([JSON.stringify(snapshots, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drift-export-" + Date.now() + ".json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("exported " + snapshots.length + " snapshots");
  } catch (e) {
    showToast("export failed");
  }
});

editor.addEventListener("blur", () => {
  status.textContent = "paused";
  status.className = "status-pill paused";
});

editor.addEventListener("focus", async () => {
  if (!currentDocId) return;
  document.querySelectorAll(".commit-item").forEach(el => el.classList.remove("active"));
  closeDiff();
  if (gitClient && currentDocId && currentFilename) {
    try {
      const result = await gitClient.readFile({ docId: currentDocId, filename: currentFilename });
      editor.value = result.content;
    } catch {
      // Fall back to server
      const d = await fetch("/api/documents/" + currentDocId + "/file").then(r => r.json());
      editor.value = d.content;
    }
  } else if (ws && ws.readyState === 1) {
    fetch("/api/documents/" + currentDocId + "/file").then(r => r.json()).then(d => {
      editor.value = d.content;
    });
  }
  status.textContent = "ready";
  status.className = "status-pill";
});

// ─── Landing page auth-aware links ───

function handleStartWritingClick(e) {
  if (!currentUser) {
    e.preventDefault();
    pendingRoute = "#/poems";
    showAuth();
  }
  // If logged in, default href="#/poems" navigates normally
}

const landingStartWriting = document.getElementById("landingStartWriting");
const landingCtaStart = document.getElementById("landingCtaStart");
const landingSignInLink = document.getElementById("landingSignInLink");

if (landingStartWriting) landingStartWriting.addEventListener("click", handleStartWritingClick);
if (landingCtaStart) landingCtaStart.addEventListener("click", handleStartWritingClick);
if (landingSignInLink) {
  landingSignInLink.addEventListener("click", (e) => {
    e.preventDefault();
    pendingRoute = null;
    showAuth();
  });
}

// ─── Init: route on load ───
route();
