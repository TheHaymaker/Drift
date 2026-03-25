// src/views/demo.js
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import Playback from "../Playback.jsx";
import { state } from '../state.js';

const demoThreshold = 1200;

export function wordCount(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function demoHash() {
  return Math.random().toString(16).slice(2, 9);
}

export function initDemo() {
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

  state.demoCommits = [];
  state.demoPrevWordCount = 0;
  state.demoIsTyping = false;
  state.demoLastKeystroke = 0;
  demoEditor.value = "";
  demoCommitsEl.innerHTML = '<div class="demo-empty">your snapshots will appear here.</div>';
  demoCommitCount.textContent = "0";
  demoStatus.textContent = "ready";
  demoStatus.className = "status-pill";
  demoFill.style.strokeDashoffset = 88;
  demoRingLabel.textContent = "pause \u2192 commit";
  demoHint.textContent = "";

  state.demoInputHandler = () => {
    state.demoLastKeystroke = Date.now();
    state.demoIsTyping = true;
    demoStatus.textContent = "writing";
    demoStatus.className = "status-pill typing";
  };

  demoEditor.addEventListener("input", state.demoInputHandler);

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

    if (state.demoCommits.length === 0) {
      message = "first draft";
    } else {
      const diff = wc - state.demoPrevWordCount;
      if (diff > 0) message = "+" + diff + " words";
      else if (diff < 0) message = diff + " words";
      else message = "revised";
    }

    state.demoPrevWordCount = wc;
    const lines = content.split("\n");
    const date = new Date().toLocaleString();
    const commit = { hash, message, lines, date, index: state.demoCommits.length };
    state.demoCommits.push(commit);

    // Update commit count
    demoCommitCount.textContent = state.demoCommits.length;

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
    const count = state.demoCommits.length;
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
    const elapsed = now - state.demoLastKeystroke;

    if (state.demoIsTyping && elapsed < demoThreshold) {
      const progress = elapsed / demoThreshold;
      const offset = 88 * (1 - progress);
      demoFill.style.strokeDashoffset = offset;
      demoRingLabel.textContent = ((demoThreshold - elapsed) / 1000).toFixed(1) + "s \u2192 commit";
    } else if (state.demoIsTyping && elapsed >= demoThreshold) {
      demoFill.style.strokeDashoffset = 0;
      state.demoIsTyping = false;
      demoCommit();
    } else {
      demoFill.style.strokeDashoffset = 88;
      demoRingLabel.textContent = "pause \u2192 commit";
    }

    state.demoAnimFrame = requestAnimationFrame(updateDemoRing);
  }

  state.demoAnimFrame = requestAnimationFrame(updateDemoRing);
}

export function destroyDemo() {
  if (state.demoAnimFrame) {
    cancelAnimationFrame(state.demoAnimFrame);
    state.demoAnimFrame = null;
  }
  if (state.demoInputHandler) {
    const demoEditor = document.getElementById("demoEditor");
    if (demoEditor) demoEditor.removeEventListener("input", state.demoInputHandler);
    state.demoInputHandler = null;
  }
  // Hide playback button and overlay if present
  const playBtn = document.getElementById("demoPlaybackBtn");
  if (playBtn) playBtn.classList.add("hidden");
  const overlay = document.getElementById("demoPlaybackOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
    if (state.demoPlaybackRoot) {
      state.demoPlaybackRoot.render(null);
    }
  }
  state.demoCommits = [];
  state.demoPrevWordCount = 0;
  state.demoIsTyping = false;
}

export function showDemoPlaybackButton() {
  const btn = document.getElementById("demoPlaybackBtn");
  if (!btn || !btn.classList.contains("hidden")) return;
  btn.classList.remove("hidden");
}

export function mountDemoPlayback() {
  if (state.demoCommits.length < 3) return;

  const overlay = document.getElementById("demoPlaybackOverlay");
  if (!overlay) return;

  // Build playback data matching Playback component's expected format
  const playbackData = { commits: state.demoCommits.map(c => ({
    hash: c.hash,
    message: c.message,
    date: c.date,
    lines: c.lines,
  })) };

  overlay.classList.remove("hidden");

  if (!state.demoPlaybackRoot) {
    state.demoPlaybackRoot = createRoot(overlay);
  }
  state.demoPlaybackRoot.render(
    createElement(Playback, {
      initialData: playbackData,
      onBack: () => {
        overlay.classList.add("hidden");
        state.demoPlaybackRoot.render(null);
      },
    })
  );
}
