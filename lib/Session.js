/**
 * Session — per-document state for drift
 *
 * Replaces all global mutable state from the old server.js.
 * Each active document gets its own Session with its own pause timer,
 * commit queue, and client set.
 */

const GitOps = require("./GitOps");
const WebSocket = require("ws");

class Session {
  constructor(doc) {
    this.docId = doc.doc_id;
    this.repoPath = doc.repoPath;
    this.filename = doc.filename;
    this.clients = new Set();
    this.lastContent = "";
    this.pauseTimer = null;
    this.pauseThreshold = 3000;
    this.commitQueue = Promise.resolve();
    this.evictionTimer = null;
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;
    this.lastContent = await GitOps.readFile(this.repoPath, this.filename);
    this._initialized = true;
  }

  addClient(ws) {
    if (this.evictionTimer) {
      clearTimeout(this.evictionTimer);
      this.evictionTimer = null;
    }
    this.clients.add(ws);
  }

  removeClient(ws) {
    this.clients.delete(ws);
    return this.clients.size;
  }

  broadcast(msg, exclude) {
    const data = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  enqueueGitOp(asyncFn) {
    this.commitQueue = this.commitQueue
      .then(asyncFn)
      .catch((err) => console.error(`  git op failed (${this.docId}):`, err));
    return this.commitQueue;
  }

  async handleUpdate(ws, content) {
    await GitOps.writeFile(this.repoPath, this.filename, content);

    clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(() => {
      if (content !== this.lastContent) {
        const commitMsg = generateMessage(this.lastContent, content);
        this.enqueueGitOp(async () => {
          const result = await GitOps.commitFile(this.repoPath, this.filename, commitMsg);
          if (result) {
            this.lastContent = content;
            const log = await GitOps.getLog(this.repoPath, this.filename);
            this.broadcast({ type: "committed", ...result, log });
            console.log(`  [${this.docId}] committed: ${result.hash} — "${result.message}"`);
          }
        });
      }
    }, this.pauseThreshold);

    this.broadcast({ type: "typing", length: content.length }, ws);
  }

  async handleForceCommit(customMessage) {
    const content = await GitOps.readFile(this.repoPath, this.filename);
    if (content === this.lastContent) return;
    const commitMsg = customMessage || generateMessage(this.lastContent, content);
    await this.enqueueGitOp(async () => {
      const result = await GitOps.commitFile(this.repoPath, this.filename, commitMsg);
      if (result) {
        this.lastContent = content;
        const log = await GitOps.getLog(this.repoPath, this.filename);
        this.broadcast({ type: "committed", ...result, log });
      }
    });
  }

  setThreshold(value) {
    this.pauseThreshold = Math.max(500, Math.min(30000, value));
    this.broadcast({ type: "threshold-changed", value: this.pauseThreshold });
  }

  async flush() {
    clearTimeout(this.pauseTimer);
    const content = await GitOps.readFile(this.repoPath, this.filename);
    if (content !== this.lastContent) {
      await this.enqueueGitOp(async () => {
        const msg = generateMessage(this.lastContent, content);
        await GitOps.commitFile(this.repoPath, this.filename, msg);
      });
    }
  }
}

// ─── Commit message generation (moved from old server.js) ───

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
      const changed = nw.filter((w) => !ow.includes(w));
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

module.exports = Session;
