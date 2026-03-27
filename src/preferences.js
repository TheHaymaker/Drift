// src/preferences.js
import { state } from './state.js';

export const FONT_MAP = {
  'garamond': "'EB Garamond', Georgia, serif",
  'lora': "'Lora', Georgia, serif",
  'plex-mono': "'IBM Plex Mono', 'JetBrains Mono', monospace",
};

export function applyTheme(pref) {
  document.documentElement.setAttribute('data-theme', pref);
  localStorage.setItem('drift-theme', pref);
  updateThemeToggleIcon();
}

export function getEffectiveTheme() {
  const stored = localStorage.getItem('drift-theme') || 'system';
  if (stored === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return stored;
}

export function updateThemeToggleIcon() {
  const btn = document.getElementById('landingThemeToggle');
  if (!btn) return;
  const effective = getEffectiveTheme();
  // ☀ for dark (clicking will switch to light), ☾ for light (clicking will switch to dark)
  btn.textContent = effective === 'dark' ? '\u2600' : '\u263E';
}

export function applyFont(key) {
  const family = FONT_MAP[key] || FONT_MAP['garamond'];
  document.documentElement.style.setProperty('--font-body', family);
  localStorage.setItem('drift-font-family', key);
}

export function applyEditorFontSize(rem) {
  document.documentElement.style.setProperty('--font-editor-size', rem + 'rem');
  localStorage.setItem('drift-editor-font-size', rem);
}

export function applyPlaybackFontSize(rem) {
  document.documentElement.style.setProperty('--font-playback-size', rem + 'rem');
  localStorage.setItem('drift-playback-font-size', rem);
}

export function initPreferences() {
  // Theme
  const theme = localStorage.getItem('drift-theme') || 'system';
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

  // Set theme toggle icon
  updateThemeToggleIcon();
}

export function populateSettings() {
  // Theme
  const theme = localStorage.getItem('drift-theme') || 'system';
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

export function setActiveSegmented(pickerId, value) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  for (const btn of picker.children) {
    btn.classList.toggle('active', btn.dataset.value === String(value));
  }
}

export function setActiveFont(pickerId, value) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  for (const btn of picker.children) {
    btn.classList.toggle('active', btn.dataset.value === String(value));
  }
}

export async function showSettings() {
  const { disconnectWs } = await import('./views/editor.js');
  disconnectWs();
  state.currentDocId = null;
  document.getElementById("landingView").classList.add("hidden");
  document.getElementById("dashboardView").classList.add("hidden");
  document.getElementById("editorView").classList.add("hidden");
  document.getElementById("settingsView").classList.remove("hidden");
  document.getElementById("connStatus").classList.add("hidden");
  document.getElementById("playbackView").classList.add("hidden");
  document.title = "drift \u2014 settings";
  populateSettings();
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

// Landing nav theme toggle
document.getElementById('landingThemeToggle')?.addEventListener('click', () => {
  const effective = getEffectiveTheme();
  // Toggle: if currently dark → light, if currently light → dark
  applyTheme(effective === 'dark' ? 'light' : 'dark');
});
