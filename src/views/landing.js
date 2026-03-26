// src/views/landing.js
import { state } from '../state.js';
import { initDemo, destroyDemo } from './demo.js';
import { showAuth } from '../auth.js';

export function destroyLanding() {
  destroyDemo();
  destroySnapshotCycle();
}
export { destroyLanding as destroyDemo };

/* ─── Snapshot cycling showcase ─── */

const snapshotDiffs = [
  {
    title: 'a3f1c2d &mdash; first draft',
    html: '<span class="diff-added">old pond</span><br><span class="diff-added">a frog leaps in</span><br><span class="diff-added">water\u2019s sound</span>',
  },
  {
    title: 'b7e4a19 &mdash; revised image',
    html: '<span class="diff-kept">old </span><span class="diff-added">silent </span><span class="diff-kept">pond</span><br><span class="diff-removed">a frog</span><span class="diff-added">the frog</span><span class="diff-kept"> leaps in</span><br><span class="diff-removed">water\u2019s sound</span><span class="diff-added">splash &mdash; stillness</span>',
  },
  {
    title: 'c9d0f53 &mdash; final ending',
    html: '<span class="diff-kept">old silent pond</span><br><span class="diff-kept">the frog leaps in</span><br><span class="diff-removed">splash &mdash; stillness</span><span class="diff-added">sound of water</span>',
  },
];

let snapshotCycleInterval = null;
let snapshotActiveIndex = 0;

function initSnapshotCycle() {
  const items = document.querySelectorAll('.showcase-snapshot-item');
  const diffTitle = document.getElementById('showcaseDiffTitle');
  const diffBody = document.getElementById('showcaseDiffBody');
  if (!items.length || !diffTitle || !diffBody) return;

  snapshotActiveIndex = 0;
  applySnapshotState(items, diffTitle, diffBody);

  snapshotCycleInterval = setInterval(() => {
    snapshotActiveIndex = (snapshotActiveIndex + 1) % 3;
    applySnapshotState(items, diffTitle, diffBody);
  }, 2500);
}

function applySnapshotState(items, diffTitle, diffBody) {
  items.forEach(el => el.classList.remove('active'));
  items[snapshotActiveIndex].classList.add('active');
  const d = snapshotDiffs[snapshotActiveIndex];
  diffTitle.innerHTML = d.title;
  diffBody.style.opacity = '0';
  setTimeout(() => {
    diffBody.innerHTML = d.html;
    diffBody.style.opacity = '1';
  }, 150);
}

function destroySnapshotCycle() {
  if (snapshotCycleInterval) {
    clearInterval(snapshotCycleInterval);
    snapshotCycleInterval = null;
  }
}

export async function showLanding() {
  const { disconnectWs } = await import('./editor.js');
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
  initSnapshotCycle();
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
