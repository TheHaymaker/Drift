/**
 * git-worker.js — Web Worker for browser-side git operations
 *
 * Uses isomorphic-git + LightningFS to run git entirely in the browser.
 * Handles pause-timer logic and commit message generation (ported from Session.js).
 * Communicates with main thread via postMessage with msgId correlation.
 */

import git from "isomorphic-git";
import LightningFS from "@isomorphic-git/lightning-fs";

// ─── Per-document state ───

const docs = new Map(); // Map<docId, { fs, dir, filename, lastContent, pauseTimer, pauseThreshold }>

function getDoc(docId) {
  return docs.get(docId);
}

function getOrCreateFS(docId) {
  if (!docs.has(docId)) {
    const fs = new LightningFS(`drift-${docId}`);
    docs.set(docId, {
      fs,
      dir: `/${docId}`,
      filename: null,
      lastContent: "",
      pauseTimer: null,
      pauseThreshold: 3000,
    });
  }
  return docs.get(docId);
}

const author = { name: "drift", email: "drift@poem" };

// ─── HTML stripping for commit message analysis ───

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n$/, '');
}

// ─── Commit message generation (ported from Session.js:116-169) ───

function generateMessage(oldRaw, newRaw) {
  const oldText = stripHtml(oldRaw);
  const newText = stripHtml(newRaw);
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
    const newContent = newLines.filter(
      (l, i) => i >= oldLines.length || l !== oldLines[i]
    );
    const preview = newContent.join(" ").slice(0, 40);
    if (preview.trim())
      return `+ ${preview}${preview.length >= 40 ? "\u2026" : ""}`;
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
  if (added < 0)
    return `- ${Math.abs(added)} word${Math.abs(added) !== 1 ? "s" : ""}`;
  return "pause";
}

// ─── LCS and diff (adapted from build-frames.js:8-98) ───

function lcs(a, b) {
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const res = [];
  let i = m,
    j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      res.unshift({ ai: i - 1, bi: j - 1, v: a[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  return res;
}

function structuredDiff(oldRaw, newRaw) {
  const oldLines = stripHtml(oldRaw).split("\n");
  const newLines = stripHtml(newRaw).split("\n");
  const common = lcs(oldLines, newLines);

  const segments = [];
  let oi = 0,
    ni = 0,
    ci = 0;

  while (ci < common.length) {
    const c = common[ci];
    // Removed lines
    while (oi < c.ai) {
      segments.push({ type: "removed", text: oldLines[oi] + "\n" });
      oi++;
    }
    // Added lines
    while (ni < c.bi) {
      segments.push({ type: "added", text: newLines[ni] + "\n" });
      ni++;
    }
    // Kept line
    segments.push({ type: "kept", text: common[ci].v + "\n" });
    oi++;
    ni++;
    ci++;
  }
  // Trailing removed
  while (oi < oldLines.length) {
    segments.push({ type: "removed", text: oldLines[oi] + "\n" });
    oi++;
  }
  // Trailing added
  while (ni < newLines.length) {
    segments.push({ type: "added", text: newLines[ni] + "\n" });
    ni++;
  }

  // Merge adjacent same-type segments
  const merged = [];
  for (const seg of segments) {
    if (merged.length && merged[merged.length - 1].type === seg.type) {
      merged[merged.length - 1].text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

// ─── Git operations ───

async function handleInit({ docId, filename }) {
  const doc = getOrCreateFS(docId);
  doc.filename = filename;
  const { fs: lfs, dir } = doc;

  try {
    await lfs.promises.stat(dir);
  } catch {
    await lfs.promises.mkdir(dir, { recursive: true });
  }

  try {
    await git.resolveRef({ fs: lfs, dir, ref: "HEAD" });
    // Repo already exists — read last content
    try {
      doc.lastContent = new TextDecoder().decode(
        await lfs.promises.readFile(`${dir}/${filename}`)
      );
    } catch {
      doc.lastContent = "";
    }
    return { ok: true, existing: true };
  } catch {
    // No repo yet — initialize
    await git.init({ fs: lfs, dir, defaultBranch: "main" });
    await lfs.promises.writeFile(`${dir}/${filename}`, "");
    await git.add({ fs: lfs, dir, filepath: filename });
    await git.commit({
      fs: lfs,
      dir,
      message: "begin",
      author,
    });
    doc.lastContent = "";
    return { ok: true, existing: false };
  }
}

async function handleWriteFile({ docId, filename, content }) {
  const doc = getDoc(docId);
  if (!doc) throw new Error(`doc ${docId} not initialized`);
  const { fs: lfs, dir } = doc;

  await lfs.promises.writeFile(`${dir}/${filename}`, content);

  // Reset pause timer
  clearTimeout(doc.pauseTimer);
  doc.pauseTimer = setTimeout(() => {
    if (content !== doc.lastContent) {
      const message = generateMessage(doc.lastContent, content);
      doCommit(doc, filename, message, content).then((result) => {
        if (result) {
          // Unsolicited committed event — push to main thread
          self.postMessage({ type: "committed", ...result });
        }
      });
    }
  }, doc.pauseThreshold);

  return { ok: true };
}

async function doCommit(doc, filename, message, content) {
  const { fs: lfs, dir } = doc;

  // Check if there are actual changes
  try {
    const status = await git.status({ fs: lfs, dir, filepath: filename });
    if (status === "unmodified") return null;
  } catch {
    // File might not be tracked yet
  }

  await git.add({ fs: lfs, dir, filepath: filename });

  // Double-check staged changes
  const matrix = await git.statusMatrix({ fs: lfs, dir });
  const hasChanges = matrix.some(
    ([, head, workdir, stage]) => head !== stage || head !== workdir
  );
  if (!hasChanges) return null;

  const hash = await git.commit({ fs: lfs, dir, message, author });
  doc.lastContent =
    content !== undefined
      ? content
      : new TextDecoder().decode(
          await lfs.promises.readFile(`${dir}/${filename}`)
        );

  const log = await getLogInternal(lfs, dir);
  return {
    hash: hash.slice(0, 7),
    message,
    count: log.length,
    log,
  };
}

async function handleCommit({ docId, filename, content, lastContent }) {
  const doc = getDoc(docId);
  if (!doc) throw new Error(`doc ${docId} not initialized`);
  clearTimeout(doc.pauseTimer);

  if (content === lastContent) return { noChange: true };
  const message = generateMessage(
    lastContent !== undefined ? lastContent : doc.lastContent,
    content
  );
  const result = await doCommit(doc, filename, message, content);
  return result || { noChange: true };
}

async function handleForceCommit({ docId, filename, message }) {
  const doc = getDoc(docId);
  if (!doc) throw new Error(`doc ${docId} not initialized`);
  clearTimeout(doc.pauseTimer);

  const { fs: lfs, dir } = doc;
  let content;
  try {
    content = new TextDecoder().decode(
      await lfs.promises.readFile(`${dir}/${filename}`)
    );
  } catch {
    return { noChange: true };
  }

  if (content === doc.lastContent) return { noChange: true };
  const commitMsg = message || generateMessage(doc.lastContent, content);
  const result = await doCommit(doc, filename, commitMsg, content);
  return result || { noChange: true };
}

async function handleReadFile({ docId, filename }) {
  const doc = getDoc(docId);
  if (!doc) throw new Error(`doc ${docId} not initialized`);
  try {
    const content = new TextDecoder().decode(
      await doc.fs.promises.readFile(`${doc.dir}/${filename}`)
    );
    return { content };
  } catch {
    return { content: "" };
  }
}

async function getLogInternal(lfs, dir) {
  try {
    const commits = await git.log({ fs: lfs, dir });
    return commits
      .reverse()
      .map((c, i) => ({
        hash: c.oid.slice(0, 7),
        date: new Date(c.commit.author.timestamp * 1000).toISOString(),
        message: c.commit.message.trim(),
        index: i,
      }));
  } catch {
    return [];
  }
}

async function handleGetLog({ docId }) {
  const doc = getDoc(docId);
  if (!doc) throw new Error(`doc ${docId} not initialized`);
  const log = await getLogInternal(doc.fs, doc.dir);
  return { log };
}

async function handleGetFileAt({ docId, filename, hash }) {
  const doc = getDoc(docId);
  if (!doc) throw new Error(`doc ${docId} not initialized`);
  const { fs: lfs, dir } = doc;

  try {
    // Resolve short hash to full oid
    const log = await git.log({ fs: lfs, dir });
    const match = log.find((c) => c.oid.startsWith(hash));
    if (!match) return { content: "" };

    const { blob } = await git.readBlob({
      fs: lfs,
      dir,
      oid: match.oid,
      filepath: filename,
    });
    return { content: new TextDecoder().decode(blob) };
  } catch {
    return { content: "" };
  }
}

async function handleGetStructuredDiff({ docId, filename, hashA, hashB }) {
  const contentA = (await handleGetFileAt({ docId, filename, hash: hashA }))
    .content;
  const contentB = (await handleGetFileAt({ docId, filename, hash: hashB }))
    .content;
  return { segments: structuredDiff(contentA, contentB) };
}

async function handleClone({ docId, filename, commits }) {
  const doc = getOrCreateFS(docId);
  doc.filename = filename;
  const { fs: lfs, dir } = doc;

  try {
    await lfs.promises.stat(dir);
  } catch {
    await lfs.promises.mkdir(dir, { recursive: true });
  }

  // Check if repo exists
  let hasRepo = false;
  try {
    await git.resolveRef({ fs: lfs, dir, ref: "HEAD" });
    hasRepo = true;
  } catch {
    // No repo
  }

  if (!hasRepo) {
    await git.init({ fs: lfs, dir, defaultBranch: "main" });
  }

  // Replay commits
  for (const c of commits) {
    await lfs.promises.writeFile(`${dir}/${filename}`, c.content);
    await git.add({ fs: lfs, dir, filepath: filename });
    await git.commit({
      fs: lfs,
      dir,
      message: c.message,
      author: {
        ...author,
        timestamp: c.date
          ? Math.floor(new Date(c.date).getTime() / 1000)
          : undefined,
      },
    });
  }

  doc.lastContent = commits.length > 0 ? commits[commits.length - 1].content : "";
  return { ok: true };
}

async function handleSetThreshold({ docId, value }) {
  const doc = getDoc(docId);
  if (!doc) throw new Error(`doc ${docId} not initialized`);
  doc.pauseThreshold = Math.max(500, Math.min(30000, value));
  return { ok: true, value: doc.pauseThreshold };
}

// ─── Message handler ───

const handlers = {
  init: handleInit,
  writeFile: handleWriteFile,
  commit: handleCommit,
  forceCommit: handleForceCommit,
  readFile: handleReadFile,
  getLog: handleGetLog,
  getFileAt: handleGetFileAt,
  getStructuredDiff: handleGetStructuredDiff,
  clone: handleClone,
  setThreshold: handleSetThreshold,
};

self.onmessage = async (e) => {
  const { msgId, type, ...payload } = e.data;
  const handler = handlers[type];
  if (!handler) {
    self.postMessage({ msgId, error: `unknown message type: ${type}` });
    return;
  }
  try {
    const result = await handler(payload);
    self.postMessage({ msgId, ...result });
  } catch (err) {
    self.postMessage({ msgId, error: err.message });
  }
};
