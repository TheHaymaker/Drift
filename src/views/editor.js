// src/views/editor.js
import { createElement, useState, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";
import SyllableEditor from "../SyllableEditor.jsx";
import RichTextEditor from "../RichTextEditor.jsx";
import { contentToHtml, stripHtml } from "../htmlUtils.js";
import { createGitClient } from "../git-client.js";
import { createSyncClient } from "../sync.js";
import { state } from '../state.js';
import { showToast } from '../toast.js';
import { renderCommits } from '../editor/commit-list.js';
import { checkAuth } from '../auth.js';

// Lazy import to avoid circular dep: router → editor → router
let _navigate = (hash) => { location.hash = hash; };
let _getRoute = () => {
  const hash = location.hash || "#/";
  const writeMatch = hash.match(/^#\/write\/(.+)$/);
  if (writeMatch) return { view: "write", docId: writeMatch[1] };
  return { view: "landing" };
};
import('../router.js').then(m => {
  _navigate = m.navigate;
  _getRoute = m.getRoute;
});

export const canUseLocalGit =
  typeof Worker !== "undefined" && typeof indexedDB !== "undefined";

const editor = document.getElementById("editor");
const status = document.getElementById("status");
const filenameEl = document.getElementById("filename");
const commitCountNum = document.getElementById("commitCountNum");
const thresholdSlider = document.getElementById("thresholdSlider");
const thresholdValue = document.getElementById("thresholdValue");
const forceCommitBtn = document.getElementById("forceCommitBtn");
const exportBtn = document.getElementById("exportBtn");
const connDot = document.getElementById("connDot");
const connLabel = document.getElementById("connLabel");
const sylModeBtn = document.getElementById("sylModeBtn");
const syllableEditorMount = document.getElementById("syllableEditorMount");
const sidebarToggle = document.getElementById("sidebarToggle");
const sidebar = document.querySelector(".sidebar");
const editorViewEl = document.getElementById("editorView");

// Restore collapsed state from localStorage
if (sidebar && sidebarToggle && editorViewEl) {
  if (localStorage.getItem("sidebarCollapsed") === "true") {
    sidebar.classList.add("collapsed");
    editorViewEl.classList.add("sidebar-collapsed");
    sidebarToggle.innerHTML = "&#9654;";
  }
  sidebarToggle.addEventListener("click", () => {
    const collapsed = sidebar.classList.toggle("collapsed");
    editorViewEl.classList.toggle("sidebar-collapsed", collapsed);
    sidebarToggle.innerHTML = collapsed ? "&#9654;" : "&#9664;";
    localStorage.setItem("sidebarCollapsed", collapsed);
  });
}

export function setEditorEditable(editable) {
  editor.readOnly = !editable;
  editor.dispatchEvent(new CustomEvent("_syl-editable", { detail: editable }));
}

export function setEditorContent(content) {
  state.currentHtml = contentToHtml(content);
  editor.value = stripHtml(content);
  // Notify whichever React editor is mounted
  editor.dispatchEvent(new CustomEvent("_syl-sync"));
}

export function mountSyllableEditor() {
  if (!state.syllableEditorRoot) {
    state.syllableEditorRoot = createRoot(syllableEditorMount);
  }
  // SyllableEditorWrapper is a thin stateful bridge that reads editor.value
  // and routes changes back through the native textarea event system.
  function SyllableEditorWrapper() {
    const [text, setText] = useState(editor.value);
    const [html, setHtml] = useState(state.currentHtml || contentToHtml(editor.value));
    const [editable, setEditable] = useState(!editor.readOnly);

    // Keep in sync when the textarea is updated externally (e.g. commit history
    // click, WS init) by listening to a custom event dispatched by setEditorContent().
    useEffect(() => {
      const sync = () => {
        setText(editor.value);
        setHtml(state.currentHtml || contentToHtml(editor.value));
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
      state.currentHtml = newHtml;
    }, []);

    const handleFormKeyChange = useCallback((key) => {
      state.currentFormKey = key;
      if (state.currentDocId) {
        localStorage.setItem("drift-form:" + state.currentDocId, key);
      }
    }, []);

    return createElement(SyllableEditor, {
      value: text,
      htmlContent: html,
      onChange: handleChange,
      onHtmlChange: handleHtmlChange,
      initialFormKey: state.currentFormKey,
      onFormKeyChange: handleFormKeyChange,
      editable,
    });
  }

  state.syllableEditorRoot.render(createElement(SyllableEditorWrapper));
}

export function unmountSyllableEditor() {
  if (state.syllableEditorRoot) {
    state.syllableEditorRoot.render(null);
  }
}

export function mountStandaloneEditor() {
  if (!state.standaloneEditorRoot) {
    state.standaloneEditorRoot = createRoot(document.getElementById("standaloneEditorMount"));
  }
  function StandaloneWrapper() {
    const [html, setHtml] = useState(state.currentHtml || contentToHtml(editor.value));
    const [editable, setEditable] = useState(!editor.readOnly);

    useEffect(() => {
      const sync = () => setHtml(state.currentHtml || contentToHtml(editor.value));
      editor.addEventListener("_syl-sync", sync);
      return () => editor.removeEventListener("_syl-sync", sync);
    }, []);

    useEffect(() => {
      const onEditable = (e) => setEditable(e.detail);
      editor.addEventListener("_syl-editable", onEditable);
      return () => editor.removeEventListener("_syl-editable", onEditable);
    }, []);

    const handleUpdate = useCallback((newHtml, plainText) => {
      state.currentHtml = newHtml;
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
  state.standaloneEditorRoot.render(createElement(StandaloneWrapper));
}

export function unmountStandaloneEditor() {
  if (state.standaloneEditorRoot) {
    state.standaloneEditorRoot.render(null);
  }
}

export function setSylMode(active) {
  state.sylModeActive = active;
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

export function showEditor(docId, readOnly) {
  if (state.currentDocId === docId && state.ws && state.ws.readyState === 1) return;
  state.currentDocId = docId;
  state.currentFormKey = localStorage.getItem("drift-form:" + docId) || 'haiku';
  document.getElementById("landingView").classList.add("hidden");
  document.getElementById("dashboardView").classList.add("hidden");
  document.getElementById("editorView").classList.remove("hidden");
  document.getElementById("settingsView").classList.add("hidden");
  document.getElementById("connStatus").classList.remove("hidden");
  editor.readOnly = !!readOnly;
  editor.style.display = "none"; // always hidden — rich editor replaces it
  document.title = "drift \u2014 writing";
  connectWs(docId);

  // Mount the appropriate rich editor
  if (!state.sylModeActive) {
    mountStandaloneEditor();
    document.getElementById("standaloneEditorMount").classList.add("visible");
  }
}

export function disconnectWs() {
  destroyLocalGit();
  if (state.ws) {
    state.ws.onclose = null;
    state.ws.close();
    state.ws = null;
  }
}

let wsReconnectAttempt = 0;

export function connectWs(docId) {
  disconnectWs();
  wsReconnectAttempt = 0;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  state.ws = new WebSocket(`${proto}//${location.host}`);

  state.ws.onopen = () => {
    connDot.className = "connection-dot connected";
    connLabel.textContent = "connected";
    status.textContent = "joining";
    status.className = "status-pill";
    state.ws.send(JSON.stringify({ type: "join", docId }));
  };

  state.ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    if (msg.type === "init") {
      setEditorContent(msg.content);
      state.currentFilename = msg.filename;
      filenameEl.textContent = msg.filename;
      state.pauseThreshold = msg.pauseThreshold;
      thresholdSlider.value = state.pauseThreshold;
      thresholdValue.textContent = (state.pauseThreshold / 1000).toFixed(1) + "s";
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
      state.pauseThreshold = msg.value;
      thresholdSlider.value = msg.value;
      thresholdValue.textContent = (msg.value / 1000).toFixed(1) + "s";
    }

    if (msg.type === "renamed") {
      filenameEl.textContent = msg.filename;
      showToast("renamed to " + msg.filename);
    }

    if (msg.type === "deleted") {
      showToast("this poem has been deleted");
      _navigate("#/poems");
    }

    if (msg.type === "error") {
      showToast(msg.message);
    }
  };

  state.ws.onclose = () => {
    if (state.gitClient) {
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
    if (_getRoute().docId === docId) {
      wsReconnectAttempt++;
      const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempt - 1), 30000);
      setTimeout(async () => {
        if (_getRoute().docId !== docId) return;
        const authed = await checkAuth();
        if (!authed) {
          state.currentUser = null;
          location.hash = "#/";
          return;
        }
        connectWs(docId);
      }, delay);
    }
  };

  state.ws.onerror = () => state.ws.close();
}

export async function initLocalGit(docId, filename, serverContent, serverLog) {
  destroyLocalGit();
  state.gitClient = createGitClient();

  try {
    const initResult = await state.gitClient.init({ docId, filename });

    // If repo was just created and server has history, clone it
    if (!initResult.existing && serverLog && serverLog.length > 0) {
      // Fetch full commit data from server for clone
      const res = await fetch(`/api/documents/${docId}/sync/clone`);
      if (res.ok) {
        const data = await res.json();
        if (data.commits && data.commits.length > 0) {
          await state.gitClient.clone({ docId, filename, commits: data.commits });
        }
      }
    } else if (initResult.existing) {
      // Existing local repo — write current content to match server
      await state.gitClient.writeFile({ docId, filename, content: serverContent });
    }

    // Set threshold to match
    await state.gitClient.setThreshold({ docId, value: state.pauseThreshold });

    // Initialize sync client
    state.syncClient = createSyncClient(docId, filename, state.gitClient);

    // Listen for local commits (from pause timer in worker)
    state.gitClient.onCommit(async (data) => {
      // Update UI from local git
      const logResult = await state.gitClient.getLog({ docId });
      renderCommits(logResult.log, data.hash);
      showToast(data.hash + " \u2014 " + data.message);
      status.textContent = "committed " + data.hash;
      status.className = "status-pill committed";
      setTimeout(() => {
        status.textContent = "ready";
        status.className = "status-pill";
      }, 2000);

      // Queue sync push
      if (state.syncClient) state.syncClient.pushCommit(data);
    });

    console.log("[drift] browser git ready for", docId);
  } catch (err) {
    console.error("[drift] browser git init failed:", err);
    state.gitClient = null;
  }
}

export function destroyLocalGit() {
  if (state.syncClient) {
    state.syncClient.destroy();
    state.syncClient = null;
  }
  if (state.gitClient) {
    state.gitClient.destroy();
    state.gitClient = null;
  }
}

export async function reorderCommit(fromIndex, toIndex) {
  if (!state.gitClient || !state.currentDocId || !state.currentFilename) {
    showToast("reorder unavailable");
    return;
  }
  // Build new order: take the chronological commit order and move fromIndex to toIndex
  const order = state.commitLog.map(c => c.hash);
  const [moved] = order.splice(fromIndex, 1);
  const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex;
  order.splice(insertAt, 0, moved);

  try {
    showToast("reordering\u2026");
    const result = await state.gitClient.reorder({
      docId: state.currentDocId,
      filename: state.currentFilename,
      newOrder: order,
    });
    if (result && result.log) {
      renderCommits(result.log);
      setEditorContent(result.content);
      showToast("commits reordered");
      if (state.syncClient) state.syncClient.fullSync();
    }
  } catch (err) {
    showToast("reorder failed: " + err.message);
  }
}

// ─── Editor event listeners ───

sylModeBtn.addEventListener("click", () => setSylMode(!state.sylModeActive));

editor.addEventListener("input", () => {
  if (editor.readOnly) return;
  state.lastKeystroke = Date.now();
  state.isTyping = true;
  status.textContent = "writing";
  status.className = "status-pill typing";

  // Use the rich HTML content for storage; fall back to plain text
  const contentForStorage = state.currentHtml || editor.value;

  if (state.gitClient && state.currentDocId && state.currentFilename) {
    // Write to local git (pause timer in worker handles commits)
    state.gitClient.writeFile({
      docId: state.currentDocId,
      filename: state.currentFilename,
      content: contentForStorage,
    });
    // Send lightweight typing indicator over WebSocket
    if (state.ws && state.ws.readyState === 1) {
      state.ws.send(JSON.stringify({ type: "typing", length: editor.value.length }));
    }
  } else {
    // Fallback: send full content over WebSocket (original path)
    if (state.ws && state.ws.readyState === 1) {
      state.ws.send(JSON.stringify({ type: "update", content: contentForStorage }));
    }
  }
});

thresholdSlider.addEventListener("input", () => {
  const val = parseInt(thresholdSlider.value);
  thresholdValue.textContent = (val / 1000).toFixed(1) + "s";
  state.pauseThreshold = val;
  if (state.gitClient && state.currentDocId) {
    state.gitClient.setThreshold({ docId: state.currentDocId, value: val });
  }
  if (state.ws && state.ws.readyState === 1) {
    state.ws.send(JSON.stringify({ type: "set-threshold", value: val }));
  }
});

forceCommitBtn.addEventListener("click", async () => {
  if (state.gitClient && state.currentDocId && state.currentFilename) {
    const result = await state.gitClient.forceCommit({
      docId: state.currentDocId,
      filename: state.currentFilename,
    });
    if (result && !result.noChange) {
      const logResult = await state.gitClient.getLog({ docId: state.currentDocId });
      renderCommits(logResult.log, result.hash);
      showToast(result.hash + " \u2014 " + result.message);
      if (state.syncClient) state.syncClient.pushCommit(result);
    }
  } else if (state.ws && state.ws.readyState === 1) {
    state.ws.send(JSON.stringify({ type: "force-commit" }));
  }
});

document.getElementById("playbackBtn").addEventListener("click", () => {
  if (state.currentDocId) _navigate("#/read/" + state.currentDocId);
});

exportBtn.addEventListener("click", async () => {
  if (!state.currentDocId) return;
  try {
    let snapshots;
    if (state.gitClient && state.currentFilename) {
      // Export from local git
      const logResult = await state.gitClient.getLog({ docId: state.currentDocId });
      snapshots = [];
      for (const c of logResult.log) {
        const snap = await state.gitClient.getFileAt({ docId: state.currentDocId, filename: state.currentFilename, hash: c.hash });
        snapshots.push({ ...c, content: snap.content });
      }
    } else {
      // Export from server
      const log = await fetch("/api/documents/" + state.currentDocId + "/log").then(r => r.json());
      snapshots = [];
      for (const c of log) {
        const snap = await fetch("/api/documents/" + state.currentDocId + "/snapshot/" + c.hash).then(r => r.json());
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
  if (!state.currentDocId) return;
  document.querySelectorAll(".commit-item").forEach(el => el.classList.remove("active"));
  if (state.gitClient && state.currentDocId && state.currentFilename) {
    try {
      const result = await state.gitClient.readFile({ docId: state.currentDocId, filename: state.currentFilename });
      setEditorContent(result.content);
    } catch {
      // Fall back to server
      const d = await fetch("/api/documents/" + state.currentDocId + "/file").then(r => r.json());
      setEditorContent(d.content);
    }
  } else if (state.ws && state.ws.readyState === 1) {
    fetch("/api/documents/" + state.currentDocId + "/file").then(r => r.json()).then(d => {
      setEditorContent(d.content);
    });
  }
  status.textContent = "ready";
  status.className = "status-pill";
});
