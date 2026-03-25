import "./style.css";
import { createElement, useState, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";
import Playback from "./Playback.jsx";
import SyllableEditor from "./SyllableEditor.jsx";
import RichTextEditor from "./RichTextEditor.jsx";
import { contentToHtml, stripHtml } from "./htmlUtils.js";
import { createGitClient } from "./git-client.js";
import { createSyncClient } from "./sync.js";

// ─── Theme & Preferences ───

const FONT_MAP = {
  'garamond': "'EB Garamond', Georgia, serif",
  'lora': "'Lora', Georgia, serif",
  'plex-mono': "'IBM Plex Mono', 'JetBrains Mono', monospace",
};

function applyTheme(pref) {
  document.documentElement.setAttribute('data-theme', pref);
  localStorage.setItem('drift-theme', pref);
}

function applyFont(key) {
  const family = FONT_MAP[key] || FONT_MAP['garamond'];
  document.documentElement.style.setProperty('--font-body', family);
  localStorage.setItem('drift-font-family', key);
}

function applyEditorFontSize(rem) {
  document.documentElement.style.setProperty('--font-editor-size', rem + 'rem');
  localStorage.setItem('drift-editor-font-size', rem);
}

function applyPlaybackFontSize(rem) {
  document.documentElement.style.setProperty('--font-playback-size', rem + 'rem');
  localStorage.setItem('drift-playback-font-size', rem);
}

function initPreferences() {
  // Theme
  const theme = localStorage.getItem('drift-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  // Font family
  const fontKey = localStorage.getItem('drift-font-family') || 'garamond';
  const family = FONT_MAP[fontKey] || FONT_MAP['garamond'];
  document.documentElement.style.setProperty('--font-body', family);

  // Font sizes
  const editorSize = localStorage.getItem('drift-editor-font-size') || '1.45';
  document.documentElement.style.setProperty('--font-editor-size', editorSize + 'rem');

  const playbackSize = localStorage.getItem('drift-playback-font-size') || '1.45';
  document.documentElement.style.setProperty('--font-playback-size', playbackSize + 'rem');
}

// Apply preferences immediately to prevent flash
initPreferences();

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
  document.getElementById("settingsView").classList.add("hidden");
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
  settingsView.classList.add("hidden");
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
const settingsView = document.getElementById("settingsView");
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
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const navBanner = document.getElementById("navBanner");
const navBannerText = document.getElementById("navBannerText");
const navBannerClose = document.getElementById("navBannerClose");
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
const diffTitle = document.getElementById("diffTitle");
const diffBody = document.getElementById("diffBody");
const diffClose = document.getElementById("diffClose");
const sylModeBtn = document.getElementById("sylModeBtn");
const syllableEditorMount = document.getElementById("syllableEditorMount");

let ws;
let currentDocId = null;
let pauseThreshold = parseInt(localStorage.getItem('drift-default-threshold')) || 3000;
let lastKeystroke = 0;
let animFrame;
let isTyping = false;
let commitLog = [];

// ─── History navigation state ───
let historyPosition = -1; // -1 = at HEAD (normal editing), 0..N = viewing that commit index

function setEditorEditable(editable) {
  editor.readOnly = !editable;
  editor.dispatchEvent(new CustomEvent("_syl-editable", { detail: editable }));
}

// ─── Commit selection state ───
let selectedCommits = new Set(); // Set of commit indices
let lastSelectedIndex = null;   // For shift+click range selection
let pendingDeleteIndices = null; // Indices pending delete confirmation

// ─── Drag-and-drop state ───
let dragSourceIndex = null;

// ─── Syllable Editor ───
let syllableEditorRoot = null;
let sylModeActive = false;
let currentFormKey = 'haiku';

// ─── Rich text state ───
// The hidden textarea (#editor) holds plain text for backward-compat event flow.
// currentHtml holds the authoritative rich content (HTML) for git/WS storage.
let currentHtml = '';
let standaloneEditorRoot = null;

function mountSyllableEditor() {
  if (!syllableEditorRoot) {
    syllableEditorRoot = createRoot(syllableEditorMount);
  }
  // SyllableEditorWrapper is a thin stateful bridge that reads editor.value
  // and routes changes back through the native textarea event system.
  function SyllableEditorWrapper() {
    const [text, setText] = useState(editor.value);
    const [html, setHtml] = useState(currentHtml || contentToHtml(editor.value));
    const [editable, setEditable] = useState(!editor.readOnly);

    // Keep in sync when the textarea is updated externally (e.g. commit history
    // click, WS init) by listening to a custom event dispatched by setEditorContent().
    useEffect(() => {
      const sync = () => {
        setText(editor.value);
        setHtml(currentHtml || contentToHtml(editor.value));
      };
      editor.addEventListener("_syl-sync", sync);
      return () => editor.removeEventListener("_syl-sync", sync);
    }, []);

    useEffect(() => {
      const onEditable = (e) => setEditable(e.detail);
      editor.addEventListener("_syl-editable", onEditable);
      return () => editor.removeEventListener("_syl-editable", onEditable);
    }, []);

    const handleChange = useCallback((newText) => {
      setText(newText);
      editor.value = newText;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }, []);

    const handleHtmlChange = useCallback((newHtml) => {
      currentHtml = newHtml;
    }, []);

    const handleFormKeyChange = useCallback((key) => {
      currentFormKey = key;
      if (currentDocId) {
        localStorage.setItem("drift-form:" + currentDocId, key);
      }
    }, []);

    return createElement(SyllableEditor, {
      value: text,
      htmlContent: html,
      onChange: handleChange,
      onHtmlChange: handleHtmlChange,
      initialFormKey: currentFormKey,
      onFormKeyChange: handleFormKeyChange,
      editable,
    });
  }

  syllableEditorRoot.render(createElement(SyllableEditorWrapper));
}

function unmountSyllableEditor() {
  if (syllableEditorRoot) {
    syllableEditorRoot.render(null);
  }
}

// ─── Standalone rich editor (non-syllable mode) ───

function mountStandaloneEditor() {
  if (!standaloneEditorRoot) {
    standaloneEditorRoot = createRoot(document.getElementById("standaloneEditorMount"));
  }
  function StandaloneWrapper() {
    const [html, setHtml] = useState(currentHtml || contentToHtml(editor.value));
    const [editable, setEditable] = useState(!editor.readOnly);

    useEffect(() => {
      const sync = () => setHtml(currentHtml || contentToHtml(editor.value));
      editor.addEventListener("_syl-sync", sync);
      return () => editor.removeEventListener("_syl-sync", sync);
    }, []);

    useEffect(() => {
      const onEditable = (e) => setEditable(e.detail);
      editor.addEventListener("_syl-editable", onEditable);
      return () => editor.removeEventListener("_syl-editable", onEditable);
    }, []);

    const handleUpdate = useCallback((newHtml, plainText) => {
      currentHtml = newHtml;
      editor.value = plainText;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }, []);

    return createElement(RichTextEditor, {
      content: html,
      onUpdate: handleUpdate,
      placeholder: "begin writing. drift commits when you pause.",
      autoFocus: true,
      editable,
    });
  }
  standaloneEditorRoot.render(createElement(StandaloneWrapper));
}

function unmountStandaloneEditor() {
  if (standaloneEditorRoot) {
    standaloneEditorRoot.render(null);
  }
}

function setSylMode(active) {
  sylModeActive = active;
  // The native textarea is always hidden — we toggle between
  // the standalone rich editor and the syllable-mode rich editor.
  editor.style.display = "none";
  if (active) {
    unmountStandaloneEditor();
    document.getElementById("standaloneEditorMount").classList.remove("visible");
    syllableEditorMount.classList.add("visible");
    sylModeBtn.classList.add("active");
    mountSyllableEditor();
  } else {
    unmountSyllableEditor();
    syllableEditorMount.classList.remove("visible");
    document.getElementById("standaloneEditorMount").classList.add("visible");
    sylModeBtn.classList.remove("active");
    mountStandaloneEditor();
  }
}

sylModeBtn.addEventListener("click", () => setSylMode(!sylModeActive));

// Helper: update content and notify the active rich editor.
function setEditorContent(content) {
  currentHtml = contentToHtml(content);
  editor.value = stripHtml(content);
  // Notify whichever React editor is mounted
  editor.dispatchEvent(new CustomEvent("_syl-sync"));
}

// ─── Router ───

function getRoute() {
  const hash = location.hash || "#/";
  const writeMatch = hash.match(/^#\/write\/(.+)$/);
  if (writeMatch) return { view: "write", docId: writeMatch[1] };
  const readMatch = hash.match(/^#\/read\/(.+)$/);
  if (readMatch) return { view: "read", docId: readMatch[1] };
  if (hash === "#/poems") return { view: "dashboard" };
  if (hash === "#/settings") return { view: "settings" };
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
  destroyDemo();

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
    } else if (r.view === "settings") {
      showSettings();
    } else {
      showLanding();
    }
  }
}

window.addEventListener("hashchange", route);

// ─── Landing ───

function showLanding() {
  disconnectWs();
  currentDocId = null;
  landingView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
  editorView.classList.add("hidden");
  settingsView.classList.add("hidden");
  connStatus.classList.add("hidden");
  document.title = "drift \u2014 where every pause is a verse";
  updateLandingNav();
  initDemo();
}

// ─── Interactive Demo ───

let demoLastKeystroke = 0;
let demoIsTyping = false;
let demoAnimFrame = null;
let demoCommits = [];
let demoPrevWordCount = 0;
const demoThreshold = 1200;
let demoInputHandler = null;
let demoPlaybackRoot = null;

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

  const demoPlaybackBtn = document.getElementById("demoPlaybackBtn");
  if (demoPlaybackBtn) {
    demoPlaybackBtn.onclick = () => mountDemoPlayback();
  }

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
    const lines = content.split("\n");
    const date = new Date().toLocaleString();
    const commit = { hash, message, lines, date, index: demoCommits.length };
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
    } else if (count >= 3) {
      demoHint.textContent = "";
      showDemoPlaybackButton();
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
  // Hide playback button and overlay if present
  const playBtn = document.getElementById("demoPlaybackBtn");
  if (playBtn) playBtn.classList.add("hidden");
  const overlay = document.getElementById("demoPlaybackOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
    if (demoPlaybackRoot) {
      demoPlaybackRoot.render(null);
    }
  }
  demoCommits = [];
  demoPrevWordCount = 0;
  demoIsTyping = false;
}

function showDemoPlaybackButton() {
  const btn = document.getElementById("demoPlaybackBtn");
  if (!btn || !btn.classList.contains("hidden")) return;
  btn.classList.remove("hidden");
}

function mountDemoPlayback() {
  if (demoCommits.length < 3) return;

  const overlay = document.getElementById("demoPlaybackOverlay");
  if (!overlay) return;

  // Build playback data matching Playback component's expected format
  const playbackData = { commits: demoCommits.map(c => ({
    hash: c.hash,
    message: c.message,
    date: c.date,
    lines: c.lines,
  })) };

  overlay.classList.remove("hidden");

  if (!demoPlaybackRoot) {
    demoPlaybackRoot = createRoot(overlay);
  }
  demoPlaybackRoot.render(
    createElement(Playback, {
      initialData: playbackData,
      onBack: () => {
        overlay.classList.add("hidden");
        demoPlaybackRoot.render(null);
      },
    })
  );
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
  settingsView.classList.add("hidden");
  connStatus.classList.add("hidden");
  document.title = "drift";
  if (currentUser) {
    dashboardSubtitle.textContent = currentUser.username + "'s poems";
  }
  loadDocList();
}

// ─── Settings ───

function showSettings() {
  disconnectWs();
  currentDocId = null;
  landingView.classList.add("hidden");
  dashboardView.classList.add("hidden");
  editorView.classList.add("hidden");
  settingsView.classList.remove("hidden");
  connStatus.classList.add("hidden");
  playbackContainer.classList.add("hidden");
  document.title = "drift — settings";
  populateSettings();
}

function populateSettings() {
  // Theme
  const theme = localStorage.getItem('drift-theme') || 'dark';
  setActiveSegmented('themePicker', theme);

  // Font
  const font = localStorage.getItem('drift-font-family') || 'garamond';
  setActiveFont('fontPicker', font);

  // Editor font size
  const editorSize = localStorage.getItem('drift-editor-font-size') || '1.45';
  const editorSlider = document.getElementById('settingsEditorSizeSlider');
  const editorLabel = document.getElementById('settingsEditorSizeValue');
  editorSlider.value = editorSize;
  editorLabel.textContent = editorSize + 'rem';

  // Playback font size
  const playbackSize = localStorage.getItem('drift-playback-font-size') || '1.45';
  const playbackSlider = document.getElementById('settingsPlaybackSizeSlider');
  const playbackLabel = document.getElementById('settingsPlaybackSizeValue');
  playbackSlider.value = playbackSize;
  playbackLabel.textContent = playbackSize + 'rem';

  // Threshold
  const threshold = localStorage.getItem('drift-default-threshold') || '3000';
  const threshSlider = document.getElementById('settingsThresholdSlider');
  const threshLabel = document.getElementById('settingsThresholdValue');
  threshSlider.value = threshold;
  threshLabel.textContent = (parseInt(threshold) / 1000).toFixed(1) + 's';

  // Speed
  const speedIdx = localStorage.getItem('drift-default-speed') || '1';
  setActiveSegmented('speedPicker', speedIdx);
}

function setActiveSegmented(pickerId, value) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  for (const btn of picker.children) {
    btn.classList.toggle('active', btn.dataset.value === String(value));
  }
}

function setActiveFont(pickerId, value) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  for (const btn of picker.children) {
    btn.classList.toggle('active', btn.dataset.value === String(value));
  }
}

// Settings event listeners
document.getElementById('themePicker')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-value]');
  if (!btn) return;
  applyTheme(btn.dataset.value);
  setActiveSegmented('themePicker', btn.dataset.value);
});

document.getElementById('fontPicker')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-value]');
  if (!btn) return;
  applyFont(btn.dataset.value);
  setActiveFont('fontPicker', btn.dataset.value);
});

document.getElementById('settingsEditorSizeSlider')?.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value).toFixed(2);
  document.getElementById('settingsEditorSizeValue').textContent = val + 'rem';
  applyEditorFontSize(val);
});

document.getElementById('settingsPlaybackSizeSlider')?.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value).toFixed(2);
  document.getElementById('settingsPlaybackSizeValue').textContent = val + 'rem';
  applyPlaybackFontSize(val);
});

document.getElementById('settingsThresholdSlider')?.addEventListener('input', (e) => {
  const val = parseInt(e.target.value);
  document.getElementById('settingsThresholdValue').textContent = (val / 1000).toFixed(1) + 's';
  localStorage.setItem('drift-default-threshold', val);
});

document.getElementById('speedPicker')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-value]');
  if (!btn) return;
  localStorage.setItem('drift-default-speed', btn.dataset.value);
  setActiveSegmented('speedPicker', btn.dataset.value);
});

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
  currentFormKey = localStorage.getItem("drift-form:" + docId) || 'haiku';
  landingView.classList.add("hidden");
  dashboardView.classList.add("hidden");
  editorView.classList.remove("hidden");
  settingsView.classList.add("hidden");
  connStatus.classList.remove("hidden");
  editor.readOnly = !!readOnly;
  editor.style.display = "none"; // always hidden — rich editor replaces it
  document.title = "drift \u2014 writing";
  connectWs(docId);

  // Mount the appropriate rich editor
  if (!sylModeActive) {
    mountStandaloneEditor();
    document.getElementById("standaloneEditorMount").classList.add("visible");
  }
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
      setEditorContent(msg.content);
      currentFilename = msg.filename;
      filenameEl.textContent = msg.filename;
      pauseThreshold = msg.pauseThreshold;
      thresholdSlider.value = pauseThreshold;
      thresholdValue.textContent = (pauseThreshold / 1000).toFixed(1) + "s";
      renderCommits(msg.log);
      status.textContent = "ready";
      status.className = "status-pill";
      // Focus is handled by the Tiptap rich editor's autoFocus prop

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

function createCommitItem(c, isNew, log) {
  const div = document.createElement("div");
  let cls = "commit-item";
  if (isNew) cls += " new";
  if (historyPosition >= 0 && c.index === historyPosition) cls += " viewing";
  if (selectedCommits.has(c.index)) cls += " selected";
  div.className = cls;
  div.dataset.hash = c.hash;
  div.dataset.index = c.index;
  div.draggable = true;
  const logLen = log ? log.length : commitLog.length;
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

async function fetchSnapshot(hash) {
  if (gitClient && currentDocId && currentFilename) {
    try {
      const snap = await gitClient.getFileAt({ docId: currentDocId, filename: currentFilename, hash });
      return snap.content;
    } catch { /* fall through */ }
  }
  const d = await fetch("/api/documents/" + currentDocId + "/snapshot/" + hash).then(r => r.json());
  return d.content;
}

async function fetchDiff(hashA, hashB) {
  if (gitClient && currentDocId && currentFilename) {
    try {
      const result = await gitClient.getStructuredDiff({ docId: currentDocId, filename: currentFilename, hashA, hashB });
      return result.segments;
    } catch { /* fall through */ }
  }
  const d = await fetch("/api/documents/" + currentDocId + "/structured-diff/" + hashA + "/" + hashB).then(r => r.json());
  return d.segments;
}

// Event delegation — single click listener on commit list
commitList.addEventListener("click", async (e) => {
  // Handle revert button clicks
  if (e.target.classList.contains("commit-revert-btn")) {
    e.stopPropagation();
    const item = e.target.closest(".commit-item");
    if (!item) return;
    const index = parseInt(item.dataset.index, 10);
    const c = commitLog[index];
    if (c) await revertToCommit(c);
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
    if (selectedCommits.has(index)) {
      selectedCommits.delete(index);
    } else {
      selectedCommits.add(index);
    }
    lastSelectedIndex = index;
    updateSelectionUI();
    renderCommits(commitLog);
    return;
  }

  if (e.shiftKey && lastSelectedIndex !== null) {
    const lo = Math.min(lastSelectedIndex, index);
    const hi = Math.max(lastSelectedIndex, index);
    for (let i = lo; i <= hi; i++) {
      selectedCommits.add(i);
    }
    updateSelectionUI();
    renderCommits(commitLog);
    return;
  }

  // Plain click: clear selection and navigate
  if (selectedCommits.size > 0) {
    clearSelection();
  }

  // Navigate to this commit
  historyPosition = index;
  updateNavUI();
  await loadSnapshot(commitLog[index]);
});

// Drag-and-drop delegation on commit list
commitList.addEventListener("dragstart", (e) => {
  const item = e.target.closest(".commit-item");
  if (!item) return;
  const index = parseInt(item.dataset.index, 10);
  dragSourceIndex = index;
  item.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(index));
});

commitList.addEventListener("dragend", (e) => {
  const item = e.target.closest(".commit-item");
  if (item) item.classList.remove("dragging");
  dragSourceIndex = null;
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
  await reorderCommit(fromIndex, toIndex);
});

function renderCommits(log, newHash) {
  commitLog = log;
  commitCountNum.textContent = log.length;

  // Update undo/redo button states
  updateNavButtons();

  // Incremental update: prepend only the new commit (skip when selecting/nav mode)
  if (newHash && commitList.children.length > 0 && selectedCommits.size === 0 && historyPosition === -1) {
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

// ─── History Navigation ───

function updateNavButtons() {
  if (!commitLog.length) {
    undoBtn.disabled = true;
    redoBtn.disabled = true;
    return;
  }
  if (historyPosition === -1) {
    // At HEAD — can undo if there's more than one commit
    undoBtn.disabled = commitLog.length <= 1;
    redoBtn.disabled = true;
  } else {
    undoBtn.disabled = historyPosition <= 0;
    redoBtn.disabled = historyPosition >= commitLog.length - 1;
  }
}

function updateNavUI() {
  updateNavButtons();
  // Highlight the current commit in the list
  document.querySelectorAll(".commit-item").forEach(el => {
    el.classList.remove("viewing", "active");
  });
  if (historyPosition >= 0) {
    const items = document.querySelectorAll(".commit-item");
    // Items are in reverse order, so index 0 in DOM = last commit
    const domIndex = commitLog.length - 1 - historyPosition;
    if (items[domIndex]) items[domIndex].classList.add("viewing");
    navBannerText.textContent = "viewing snapshot #" + (historyPosition + 1) + " of " + commitLog.length;
    navBanner.classList.remove("hidden");
    setEditorEditable(false);
  } else {
    navBanner.classList.add("hidden");
    setEditorEditable(true);
  }
}

function exitNavMode() {
  historyPosition = -1;
  updateNavUI();
  diffPanel.classList.add("hidden");
}

async function loadSnapshot(c) {
  if (c.index > 0) {
    const prev = commitLog[c.index - 1];
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

async function undoCommit() {
  if (commitLog.length <= 1) return;
  if (historyPosition === -1) {
    historyPosition = commitLog.length - 2; // go to second-to-last
  } else if (historyPosition > 0) {
    historyPosition--;
  } else {
    return;
  }
  updateNavUI();
  await loadSnapshot(commitLog[historyPosition]);
}

async function redoCommit() {
  if (historyPosition === -1) return;
  if (historyPosition < commitLog.length - 1) {
    historyPosition++;
    if (historyPosition === commitLog.length - 1) {
      // Back at HEAD
      exitNavMode();
      // Reload HEAD content
      await loadSnapshot(commitLog[commitLog.length - 1]);
    } else {
      updateNavUI();
      await loadSnapshot(commitLog[historyPosition]);
    }
  }
}

undoBtn.addEventListener("click", undoCommit);
redoBtn.addEventListener("click", redoCommit);
navBannerClose.addEventListener("click", async () => {
  exitNavMode();
  // Restore HEAD content
  if (commitLog.length > 0) {
    await loadSnapshot(commitLog[commitLog.length - 1]);
  }
});

// Keyboard shortcuts for undo/redo navigation
document.addEventListener("keydown", (e) => {
  // Only intercept when in nav mode or when editor is focused
  const isEditorFocused = document.activeElement === editor || editor.contains(document.activeElement);
  if (!currentDocId) return;

  // Ctrl/Cmd + Shift + Z = redo
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Z") {
    if (historyPosition !== -1) {
      e.preventDefault();
      redoCommit();
    }
    return;
  }

  // Ctrl/Cmd + Z = undo (only when in nav mode or not actively editing to not interfere with text undo)
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
    if (historyPosition !== -1 || !isEditorFocused) {
      e.preventDefault();
      undoCommit();
    }
    return;
  }

  // Escape = clear commit selection
  if (e.key === "Escape" && selectedCommits.size > 0) {
    e.preventDefault();
    clearSelection();
    return;
  }

  // Delete/Backspace = delete selected commits
  if ((e.key === "Delete" || e.key === "Backspace") && selectedCommits.size > 0 && !isEditorFocused) {
    e.preventDefault();
    showDeleteModal([...selectedCommits]);
    return;
  }
});

// ─── Revert to Commit ───

async function revertToCommit(commit) {
  if (!gitClient || !currentDocId || !currentFilename) {
    showToast("revert unavailable");
    return;
  }
  try {
    const result = await gitClient.revertTo({
      docId: currentDocId,
      filename: currentFilename,
      hash: commit.hash,
      commitIndex: commit.index,
    });
    if (result && result.noChange) {
      showToast("already at that content");
      exitNavMode();
      return;
    }
    if (result && result.log) {
      exitNavMode();
      setEditorContent(result.content);
      renderCommits(result.log, result.hash);
      showToast("reverted to #" + (commit.index + 1));
      if (syncClient) syncClient.pushCommit({ hash: result.hash, message: result.message });
    }
  } catch (err) {
    showToast("revert failed: " + err.message);
  }
}

// ─── Commit Selection & Actions ───

function clearSelection() {
  selectedCommits.clear();
  lastSelectedIndex = null;
  updateSelectionUI();
  renderCommits(commitLog);
}

function updateSelectionUI() {
  const count = selectedCommits.size;
  if (count > 0) {
    selectionActionBar.classList.remove("hidden");
    selectionCountText.textContent = count + " selected";
    squashSelectedBtn.disabled = count < 2;
  } else {
    selectionActionBar.classList.add("hidden");
  }
}

// ─── Squash via selection ───

squashSelectedBtn.addEventListener("click", () => {
  if (selectedCommits.size < 2) return;
  if (!gitClient || !currentDocId || !currentFilename) {
    showToast("squash unavailable");
    return;
  }
  const sorted = [...selectedCommits].sort((a, b) => a - b);
  const latestIndex = sorted[sorted.length - 1];
  const latestCommit = commitLog[latestIndex];
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
  const sorted = [...selectedCommits].sort((a, b) => a - b);
  const fromIndex = sorted[0];
  const toIndex = sorted[sorted.length - 1];
  const latestCommit = commitLog[toIndex];
  const message = latestCommit ? latestCommit.message : "";
  try {
    showToast("squashing\u2026");
    const result = await gitClient.squash({
      docId: currentDocId,
      filename: currentFilename,
      fromIndex,
      toIndex,
      message,
    });
    if (result && result.log) {
      exitNavMode();
      renderCommits(result.log);
      setEditorContent(result.content);
      showToast("squashed " + (toIndex - fromIndex + 1) + " snapshots into 1");
      if (syncClient) syncClient.fullSync();
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

function showDeleteModal(indices) {
  pendingDeleteIndices = indices;
  deleteModalCount.textContent = indices.length;
  deleteModal.classList.remove("hidden");
}

deleteModalConfirm.addEventListener("click", async () => {
  deleteModal.classList.add("hidden");
  if (!pendingDeleteIndices || !gitClient || !currentDocId || !currentFilename) {
    showToast("delete unavailable");
    return;
  }
  const indices = pendingDeleteIndices;
  pendingDeleteIndices = null;
  try {
    showToast("deleting\u2026");
    const result = await gitClient.deleteCommits({
      docId: currentDocId,
      filename: currentFilename,
      indices,
    });
    if (result && result.log) {
      exitNavMode();
      renderCommits(result.log);
      setEditorContent(result.content);
      showToast("deleted " + indices.length + " snapshot" + (indices.length > 1 ? "s" : ""));
      if (syncClient) syncClient.fullSync();
    }
  } catch (err) {
    showToast("delete failed: " + err.message);
  } finally {
    clearSelection();
  }
});

deleteModalCancel.addEventListener("click", () => {
  deleteModal.classList.add("hidden");
  pendingDeleteIndices = null;
});

deleteSelectedBtn.addEventListener("click", () => {
  if (selectedCommits.size === 0) return;
  showDeleteModal([...selectedCommits]);
});

clearSelectionBtn.addEventListener("click", () => {
  clearSelection();
});

// ─── Drag-and-Drop Reorder ───

async function reorderCommit(fromIndex, toIndex) {
  if (!gitClient || !currentDocId || !currentFilename) {
    showToast("reorder unavailable");
    return;
  }
  // Build new order: take the chronological commit order and move fromIndex to toIndex
  const order = commitLog.map(c => c.hash);
  const [moved] = order.splice(fromIndex, 1);
  const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex;
  order.splice(insertAt, 0, moved);

  try {
    showToast("reordering\u2026");
    const result = await gitClient.reorder({
      docId: currentDocId,
      filename: currentFilename,
      newOrder: order,
    });
    if (result && result.log) {
      exitNavMode();
      renderCommits(result.log);
      setEditorContent(result.content);
      showToast("commits reordered");
      if (syncClient) syncClient.fullSync();
    }
  } catch (err) {
    showToast("reorder failed: " + err.message);
  }
}

// ─── Diff panel ───

function renderDiff(segments, commit) {
  if (!segments || segments.length === 0) {
    diffPanel.classList.add("hidden");
    return;
  }

  diffTitle.textContent = commit.hash + " — " + commit.message;
  const fragment = document.createDocumentFragment();
  for (const seg of segments) {
    const span = document.createElement("span");
    span.className = "diff-seg diff-" + seg.type;
    span.textContent = seg.text;
    fragment.appendChild(span);
  }
  diffBody.innerHTML = "";
  diffBody.appendChild(fragment);
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
  // Exit navigation mode when user starts typing
  if (historyPosition !== -1) {
    exitNavMode();
  }
  lastKeystroke = Date.now();
  isTyping = true;
  status.textContent = "writing";
  status.className = "status-pill typing";

  // Use the rich HTML content for storage; fall back to plain text
  const contentForStorage = currentHtml || editor.value;

  if (gitClient && currentDocId && currentFilename) {
    // Write to local git (pause timer in worker handles commits)
    gitClient.writeFile({
      docId: currentDocId,
      filename: currentFilename,
      content: contentForStorage,
    });
    // Send lightweight typing indicator over WebSocket
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "typing", length: editor.value.length }));
    }
  } else {
    // Fallback: send full content over WebSocket (original path)
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "update", content: contentForStorage }));
    }
  }
});

// Tab key handling is managed by Tiptap's ProseMirror editor.

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
      setEditorContent(result.content);
    } catch {
      // Fall back to server
      const d = await fetch("/api/documents/" + currentDocId + "/file").then(r => r.json());
      setEditorContent(d.content);
    }
  } else if (ws && ws.readyState === 1) {
    fetch("/api/documents/" + currentDocId + "/file").then(r => r.json()).then(d => {
      setEditorContent(d.content);
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
