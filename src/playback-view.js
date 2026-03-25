// src/playback-view.js
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import Playback from "./Playback.jsx";
import { state } from './state.js';

const playbackContainer = document.getElementById("playbackView");

export function mountPlayback(docId) {
  document.getElementById("landingView").classList.add("hidden");
  document.getElementById("dashboardView").classList.add("hidden");
  document.getElementById("editorView").classList.add("hidden");
  document.getElementById("settingsView").classList.add("hidden");
  document.getElementById("connStatus").classList.add("hidden");
  playbackContainer.classList.remove("hidden");
  document.title = "drift \u2014 playback";

  if (!state.playbackRoot) {
    state.playbackRoot = createRoot(playbackContainer);
  }
  state.playbackRoot.render(
    createElement(Playback, {
      docId,
      onBack: () => { location.hash = "#/poems"; },
    })
  );
}

export function unmountPlayback() {
  playbackContainer.classList.add("hidden");
  if (state.playbackRoot) {
    state.playbackRoot.render(null);
  }
}
