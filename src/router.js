// src/router.js
import { state } from './state.js';
import { checkAuth, showAuth } from './auth.js';
import { showLanding, destroyDemo } from './views/landing.js';
import { showDashboard } from './views/dashboard.js';
import { showEditor, disconnectWs } from './views/editor.js';
import { showSettings } from './preferences.js';
import { mountPlayback, unmountPlayback } from './playback-view.js';

export function getRoute() {
  const hash = location.hash || "#/";
  const writeMatch = hash.match(/^#\/write\/(.+)$/);
  if (writeMatch) return { view: "write", docId: writeMatch[1] };
  const readMatch = hash.match(/^#\/read\/(.+)$/);
  if (readMatch) return { view: "read", docId: readMatch[1] };
  if (hash === "#/poems") return { view: "dashboard" };
  if (hash === "#/settings") return { view: "settings" };
  return { view: "landing" };
}

export function navigate(hash) {
  location.hash = hash;
}

export async function route() {
  // Always check auth status (but don't block on it)
  if (!state.currentUser) {
    await checkAuth();
  }

  const r = getRoute();
  destroyDemo();

  // Landing page is always accessible
  if (r.view === "landing") {
    document.getElementById("authView").classList.add("hidden");
    unmountPlayback();
    showLanding();
    return;
  }

  // All other views require auth
  if (!state.currentUser) {
    // Remember where user wanted to go after login
    state.pendingRoute = location.hash;
    showAuth();
    return;
  }

  document.getElementById("authView").classList.add("hidden");
  if (r.view === "read") {
    disconnectWs();
    state.currentDocId = null;
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
