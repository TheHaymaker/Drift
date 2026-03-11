#!/usr/bin/env node

/**
 * drift — server
 *
 * A writing server that auto-commits to git when you pause typing.
 * Connects to an existing repo or initializes a new one.
 *
 * Usage:
 *   node server.js [repo-path] [filename] [port]
 *
 * Defaults:
 *   repo-path: ./poem-repo
 *   filename:  poem.txt
 *   port:      3377
 */

const express = require("express");
const { WebSocketServer } = require("ws");
const { execSync, exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const REPO_PATH = path.resolve(process.argv[2] || "./poem-repo");
const FILENAME = process.argv[3] || "poem.txt";
const PORT = parseInt(process.argv[4] || "3377", 10);
const FILE_PATH = path.join(REPO_PATH, FILENAME);

// ─── Git helpers ───

function git(cmd) {
  return execSync(`git ${cmd}`, {
    cwd: REPO_PATH,
    encoding: "utf-8",
    env: { ...process.env, GIT_AUTHOR_NAME: "drift", GIT_AUTHOR_EMAIL: "drift@poem", GIT_COMMITTER_NAME: "drift", GIT_COMMITTER_EMAIL: "drift@poem" },
  }).trim();
}

function ensureRepo() {
  if (!fs.existsSync(REPO_PATH)) {
    fs.mkdirSync(REPO_PATH, { recursive: true });
  }
  if (!fs.existsSync(path.join(REPO_PATH, ".git"))) {
    git("init");
    console.log(`  initialized new repo at ${REPO_PATH}`);
  }
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, "");
    git(`add ${FILENAME}`);
    git(`commit -m "begin" --allow-empty-message`);
  }
}

function readFile() {
  try {
    return fs.readFileSync(FILE_PATH, "utf-8");
  } catch {
    return "";
  }
}

function writeFile(content) {
  fs.writeFileSync(FILE_PATH, content);
}

function commitFile(message) {
  try {
    git(`add ${FILENAME}`);
    try {
      git("diff --cached --quiet");
      return null;
    } catch {
      // diff found, commit
    }
    git(`commit -m "${message.replace(/"/g, '\\"')}"`);
    const hash = git("rev-parse --short HEAD");
    const count = parseInt(git("rev-list --count HEAD"), 10);
    console.log(`  committed: ${hash} — "${message}" (#${count})`);
    return { hash, message, count };
  } catch (e) {
    console.error("  commit failed:", e.message);
    return null;
  }
}

function getLog(max = 200) {
  try {
    const raw = git(`log --reverse --format="%H|%ai|%s" -- ${FILENAME}`);
    return raw.split("\n").filter(Boolean).map((line, i) => {
      const [hash, date, ...msg] = line.split("|");
      return { hash: hash.slice(0, 7), date, message: msg.join("|"), index: i };
    });
  } catch {
    return [];
  }
}

function getFileAt(hash) {
  try {
    return git(`show ${hash}:${FILENAME}`);
  } catch {
    return "";
  }
}

function getWordDiff(hashA, hashB) {
  try {
    return git(`diff --word-diff-regex=. ${hashA} ${hashB} -- ${FILENAME}`);
  } catch {
    return "";
  }
}

// ─── Pause detection state ───

let lastContent = "";
let pauseTimer = null;
let commitCount = 0;
let pauseThreshold = 3000;

function generateMessage(oldText, newText) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  if (oldText === "") return "begin";

  const oldWords = oldText.split(/\s+/).filter(Boolean);
  const newWords = newText.split(/\s+/).filter(Boolean);
  const added = newWords.length - oldWords.length;

  const changedLines = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    if ((oldLines[i] || "") !== (newLines[i] || "")) {
      changedLines.push(i);
    }
  }

  if (newLines.length > oldLines.length && added > 0) {
    const newContent = newLines.filter((l, i) => i >= oldLines.length || l !== oldLines[i]);
    const preview = newContent.join(" ").slice(0, 40);
    if (preview.trim()) return `+ ${preview}${preview.length >= 40 ? "…" : ""}`;
    return `+ ${added} word${added !== 1 ? "s" : ""}`;
  }

  if (newLines.length < oldLines.length) {
    const removed = oldWords.length - newWords.length;
    return `- ${removed} word${removed !== 1 ? "s" : ""}, ${oldLines.length - newLines.length} line${oldLines.length - newLines.length !== 1 ? "s" : ""}`;
  }

  if (changedLines.length === 1) {
    const li = changedLines[0];
    const oldL = oldLines[li] || "";
    const newL = newLines[li] || "";
    if (oldL && newL) {
      const ow = oldL.split(/\s+/);
      const nw = newL.split(/\s+/);
      const changed = nw.filter(w => !ow.includes(w));
      if (changed.length <= 3 && changed.length > 0) {
        return `~ ${changed.join(" ")}`;
      }
    }
    const preview = (newLines[li] || "").slice(0, 40);
    return `~ line ${li + 1}: ${preview}`;
  }

  if (changedLines.length > 1) {
    return `~ ${changedLines.length} lines revised`;
  }

  if (added > 0) return `+ ${added} word${added !== 1 ? "s" : ""}`;
  if (added < 0) return `- ${Math.abs(added)} word${Math.abs(added) !== 1 ? "s" : ""}`;
  return "pause";
}

// ─── Server ───

ensureRepo();
lastContent = readFile();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/file", (req, res) => {
  res.json({ content: readFile(), filename: FILENAME });
});

app.get("/api/log", (req, res) => {
  res.json(getLog());
});

app.get("/api/snapshot/:hash", (req, res) => {
  res.json({ content: getFileAt(req.params.hash) });
});

app.get("/api/diff/:a/:b", (req, res) => {
  res.json({ diff: getWordDiff(req.params.a, req.params.b) });
});

wss.on("connection", (ws) => {
  console.log("  writer connected");

  ws.send(JSON.stringify({
    type: "init",
    content: readFile(),
    filename: FILENAME,
    log: getLog(),
    pauseThreshold,
  }));

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "update") {
      const newContent = msg.content;
      writeFile(newContent);

      clearTimeout(pauseTimer);
      pauseTimer = setTimeout(() => {
        if (newContent !== lastContent) {
          const commitMsg = generateMessage(lastContent, newContent);
          const result = commitFile(commitMsg);
          if (result) {
            lastContent = newContent;
            const log = getLog();
            broadcast({ type: "committed", ...result, log });
          }
        }
      }, pauseThreshold);

      broadcast({ type: "typing", length: newContent.length }, ws);
    }

    if (msg.type === "force-commit") {
      const content = readFile();
      if (content !== lastContent) {
        const commitMsg = msg.message || generateMessage(lastContent, content);
        const result = commitFile(commitMsg);
        if (result) {
          lastContent = content;
          broadcast({ type: "committed", ...result, log: getLog() });
        }
      }
    }

    if (msg.type === "set-threshold") {
      pauseThreshold = Math.max(500, Math.min(30000, msg.value));
      broadcast({ type: "threshold-changed", value: pauseThreshold });
    }
  });

  ws.on("close", () => console.log("  writer disconnected"));
});

function broadcast(msg, exclude) {
  const data = JSON.stringify(msg);
  wss.clients.forEach((c) => {
    if (c !== exclude && c.readyState === 1) c.send(data);
  });
}

server.listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────┐
│                                     │
│   drift                             │
│   a writing instrument              │
│                                     │
│   http://localhost:${PORT}             │
│   repo: ${REPO_PATH.slice(-28).padEnd(28)}│
│   file: ${FILENAME.padEnd(28)}│
│   pause: ${(pauseThreshold + "ms").padEnd(27)}│
│                                     │
└─────────────────────────────────────┘
`);
});
