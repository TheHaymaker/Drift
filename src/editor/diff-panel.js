// src/editor/diff-panel.js

// Lazy import to avoid circular dep: history-nav → diff-panel → history-nav
let _exitNavMode = () => {};
let _restoreHeadContent = async () => {};
import('./history-nav.js').then(m => {
  _exitNavMode = m.exitNavMode;
  _restoreHeadContent = m.restoreHeadContent;
});

const diffPanel = document.getElementById("diffPanel");
const diffTitle = document.getElementById("diffTitle");
const diffBody = document.getElementById("diffBody");
const diffClose = document.getElementById("diffClose");

export function renderDiff(segments, commit) {
  if (!segments || segments.length === 0) {
    diffPanel.classList.add("hidden");
    return;
  }

  diffTitle.textContent = commit.hash + " \u2014 " + commit.message;
  const fragment = document.createDocumentFragment();
  for (const seg of segments) {
    const span = document.createElement("span");
    span.className = "diff-seg diff-" + seg.type;
    span.textContent = seg.text;
    fragment.appendChild(span);
  }
  diffBody.innerHTML = "";
  diffBody.appendChild(fragment);
  diffPanel.classList.remove("hidden");
}

export async function closeDiff() {
  _exitNavMode();
  await _restoreHeadContent();
}

diffClose.addEventListener("click", closeDiff);
