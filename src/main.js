import "./style.css";

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

function route() {
  const r = getRoute();
  if (r.view === "write") {
    showEditor(r.docId);
  } else if (r.view === "read") {
    showEditor(r.docId, true);
  } else {
    showDashboard();
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
        <span class="doc-item-title">${escapeHtml(doc.title || "untitled")}</span>
        <span class="doc-item-meta">${escapeHtml(doc.filename)} &middot; ${modified}</span>
      `;
      div.addEventListener("click", () => navigate("#/write/" + doc.doc_id));
      docList.appendChild(div);
    }
  } catch (e) {
    docList.innerHTML = '<div class="doc-empty">failed to load documents</div>';
  }
}

newPoemBtn.addEventListener("click", async () => {
  try {
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
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
      fetch("/api/documents/" + currentDocId + "/snapshot/" + c.hash)
        .then(r => r.json())
        .then(d => {
          editor.value = d.content;
          document.querySelectorAll(".commit-item").forEach(el => el.classList.remove("active"));
          div.classList.add("active");
          showToast("viewing " + c.hash);
        });
    });
    commitList.appendChild(div);
  }
}

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
