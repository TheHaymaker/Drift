// src/editor/diff-panel.js

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

export function closeDiff() {
  diffPanel.classList.add("hidden");
}

diffClose.addEventListener("click", closeDiff);
