// src/state.js
export const state = {
  // Auth
  currentUser: null,
  authMode: 'login',
  pendingRoute: null,

  // Document session
  currentDocId: null,
  currentFilename: null,
  currentHtml: '',
  currentFormKey: 'haiku',

  // Editor behavior
  pauseThreshold: parseInt(localStorage.getItem('drift-default-threshold')) || 3000,
  lastKeystroke: 0,
  isTyping: false,
  animFrame: null,

  // Commit list & history navigation
  commitLog: [],
  historyPosition: -1,
  selectedCommits: new Set(),
  lastSelectedIndex: null,
  pendingDeleteIndices: null,
  dragSourceIndex: null,

  // Editor mode & React roots
  sylModeActive: false,
  syllableEditorRoot: null,
  standaloneEditorRoot: null,
  playbackRoot: null,

  // Network clients
  ws: null,
  gitClient: null,
  syncClient: null,

  // Demo
  demoLastKeystroke: 0,
  demoIsTyping: false,
  demoAnimFrame: null,
  demoCommits: [],
  demoPrevWordCount: 0,
  demoInputHandler: null,
  demoPlaybackRoot: null,
};
