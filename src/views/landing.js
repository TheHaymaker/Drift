// src/views/landing.js
import { state } from '../state.js';
import { initDemo, destroyDemo } from './demo.js';
import { showAuth } from '../auth.js';

export { destroyDemo };

export function showLanding() {
  const { disconnectWs } = _editorModule();
  disconnectWs();
  state.currentDocId = null;
  document.getElementById("landingView").classList.remove("hidden");
  document.getElementById("dashboardView").classList.add("hidden");
  document.getElementById("editorView").classList.add("hidden");
  document.getElementById("settingsView").classList.add("hidden");
  document.getElementById("connStatus").classList.add("hidden");
  document.title = "drift \u2014 where every pause is a verse";
  updateLandingNav();
  initDemo();
}

export function updateLandingNav() {
  const signInLink = document.getElementById("landingSignInLink");
  if (signInLink) {
    if (state.currentUser) {
      signInLink.style.display = "none";
    } else {
      signInLink.style.display = "";
      signInLink.textContent = "Log In / Sign Up";
    }
  }
}

export function handleStartWritingClick(e) {
  if (!state.currentUser) {
    e.preventDefault();
    state.pendingRoute = "#/poems";
    showAuth();
  }
  // If logged in, default href="#/poems" navigates normally
}

// Lazy import to avoid circular deps
let _editorModuleCache = null;
function _editorModule() {
  if (!_editorModuleCache) {
    _editorModuleCache = { disconnectWs: () => {} };
    import('./editor.js').then(m => { _editorModuleCache = m; });
  }
  return _editorModuleCache;
}

// Landing auth-aware links event listeners
const landingStartWriting = document.getElementById("landingStartWriting");
const landingCtaStart = document.getElementById("landingCtaStart");
const landingSignInLink = document.getElementById("landingSignInLink");

if (landingStartWriting) landingStartWriting.addEventListener("click", handleStartWritingClick);
if (landingCtaStart) landingCtaStart.addEventListener("click", handleStartWritingClick);
if (landingSignInLink) {
  landingSignInLink.addEventListener("click", (e) => {
    e.preventDefault();
    state.pendingRoute = null;
    showAuth();
  });
}
