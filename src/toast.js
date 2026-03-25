// src/toast.js
import { state } from './state.js';

const toast = document.getElementById("toast");

export function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}
