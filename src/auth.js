// src/auth.js
import { state } from './state.js';

// Lazy imports to avoid circular dep with router.js
let _navigate = (hash) => { location.hash = hash; };
let _route = () => {};
import('./router.js').then(m => {
  _navigate = m.navigate;
  _route = m.route;
});

const authView = document.getElementById("authView");
const authForm = document.getElementById("authForm");
const authUsername = document.getElementById("authUsername");
const authPassword = document.getElementById("authPassword");
const authSubmit = document.getElementById("authSubmit");
const authToggle = document.getElementById("authToggle");
const authError = document.getElementById("authError");
const logoutBtn = document.getElementById("logoutBtn");
const dashboardSubtitle = document.getElementById("dashboardSubtitle");

export { dashboardSubtitle };

export async function checkAuth() {
  try {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      state.currentUser = await res.json();
      return true;
    }
  } catch {}
  state.currentUser = null;
  return false;
}

export function showAuth() {
  authView.classList.remove("hidden");
  document.getElementById("landingView").classList.add("hidden");
  document.getElementById("dashboardView").classList.add("hidden");
  document.getElementById("editorView").classList.add("hidden");
  document.getElementById("settingsView").classList.add("hidden");
  document.getElementById("connStatus").classList.add("hidden");
  authError.textContent = "";
  authUsername.focus();
}

authToggle.addEventListener("click", () => {
  state.authMode = state.authMode === "login" ? "register" : "login";
  authSubmit.textContent = state.authMode === "login" ? "log in" : "register";
  authToggle.textContent = state.authMode === "login"
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
    const endpoint = state.authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { authError.textContent = data.error; return; }
    state.currentUser = data;
    authPassword.value = "";
    if (state.pendingRoute) {
      const dest = state.pendingRoute;
      state.pendingRoute = null;
      location.hash = dest;
    } else {
      location.hash = "#/poems";
    }
    _route();
  } catch {
    authError.textContent = "connection failed";
  }
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  state.currentUser = null;
  location.hash = "#/";
  _route();
});
