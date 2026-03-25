/**
 * git-worker.js — Web Worker for browser-side git operations
 *
 * Uses isomorphic-git + LightningFS to run git entirely in the browser.
 * Handles pause-timer logic and commit message generation (ported from Session.js).
 * Communicates with main thread via postMessage with msgId correlation.
 */

import git from "isomorphic-git";
import LightningFS from "@isomorphic-git/lightning-fs";
import { lcs } from "../lcs.js";
import { generateCommitMessage } from "./commit-message.js";
import { squashCommits, deleteCommits, reorderCommits } from "./history-ops.js";

// ─── Per-document state ───

const docs = new Map(); // Map<docId, { fs, dir, filename, lastContent, pauseTimer, pauseThreshold }>
const oidCache = new Map(); // Map<docId, Map<shortHash, fullOid>>

function getDoc(docId) {
  return docs.get(docId);
}

function getOrCreateFS(docId) {
  if (!docs.has(docId)) {
    const fs = new LightningFS(`drift-${docId}`);
    docs.set(docId, {
      docId,
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

// ─── HTML stripping (used by structuredDiff) ───

function stripHtml(html) {
  if (!html) return '';
  return html
    // Remove Tiptap/ProseMirror trailing breaks inside paragraphs
    .replace(/<br\s*(?:class="[^"]*")?\s*\/?>\s*<\/p>/gi, '</p>')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<\/?p[^>]*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

// ─── Structured diff (adapted from build-frames.js) ───

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
  } catch (err) {
    console.error('[git-worker] handleInit stat failed:', err.message, err.stack);
    await lfs.promises.mkdir(dir, { recursive: true });
  }

  try {
    await git.resolveRef({ fs: lfs, dir, ref: "HEAD" });
    // Repo already exists — read last content
    try {
      doc.lastContent = new TextDecoder().decode(
        await lfs.promises.readFile(`${dir}/${filename}`)
      );
    } catch (err) {
      console.error('[git-worker] handleInit readFile failed:', err.message, err.stack);
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
    try {
      if (content !== doc.lastContent) {
        const message = generateCommitMessage(doc.lastContent, content);
        doCommit(doc, filename, message, content).then((result) => {
          if (result) {
            // Unsolicited committed event — push to main thread
            self.postMessage({ type: "committed", ...result });
          }
        }).catch((err) => {
          console.error('[git-worker] pause-timer commit error:', err);
        });
      }
    } catch (err) {
      console.error('[git-worker] pause-timer commit error:', err);
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
  } catch (err) {
    console.error('[git-worker] doCommit status check failed:', err.message, err.stack);
    // File might not be tracked yet
  }

  await git.add({ fs: lfs, dir, filepath: filename });

  // Compare staged content against HEAD blob — skip if identical
  try {
    const headOid = await git.resolveRef({ fs: lfs, dir, ref: "HEAD" });
    const { blob: headBlob } = await git.readBlob({
      fs: lfs, dir, oid: headOid, filepath: filename,
    });
    const currentBytes = await lfs.promises.readFile(`${dir}/${filename}`);
    if (headBlob.length === currentBytes.length &&
        headBlob.every((b, i) => b === currentBytes[i])) {
      return null; // no change from HEAD
    }
  } catch (err) {
    console.error('[git-worker] doCommit HEAD blob comparison failed:', err.message, err.stack);
    // HEAD doesn't exist or file is new — proceed with commit
  }

  const hash = await git.commit({ fs: lfs, dir, message, author });
  doc.lastContent = new TextDecoder().decode(
    await lfs.promises.readFile(`${dir}/${filename}`)
  );

  // Cache the new commit OID
  if (doc.docId) {
    if (!oidCache.has(doc.docId)) oidCache.set(doc.docId, new Map());
    oidCache.get(doc.docId).set(hash.slice(0, 7), hash);
  }

  const log = await getLogInternal(lfs, dir, doc.docId);
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
  const message = generateCommitMessage(
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
  } catch (err) {
    console.error('[git-worker] handleForceCommit readFile failed:', err.message, err.stack);
    return { noChange: true };
  }

  if (content === doc.lastContent) return { noChange: true };
  const commitMsg = message || generateCommitMessage(doc.lastContent, content);
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
  } catch (err) {
    console.error('[git-worker] handleReadFile failed:', err.message, err.stack);
    return { content: "" };
  }
}

async function getLogInternal(lfs, dir, docId) {
  try {
    const commits = await git.log({ fs: lfs, dir });
    const result = commits
      .reverse()
      .map((c, i) => ({
        hash: c.oid.slice(0, 7),
        date: new Date(c.commit.author.timestamp * 1000).toISOString(),
        message: c.commit.message.trim(),
        index: i,
      }));

    // Populate OID cache
    if (docId) {
      if (!oidCache.has(docId)) oidCache.set(docId, new Map());
      const cache = oidCache.get(docId);
      for (const c of commits) {
        cache.set(c.oid.slice(0, 7), c.oid);
      }
    }

    return result;
  } catch (err) {
    console.error('[git-worker] getLogInternal failed:', err.message, err.stack);
    return [];
  }
}

async function handleGetLog({ docId }) {
  const doc = getDoc(docId);
  if (!doc) throw new Error(`doc ${docId} not initialized`);
  const log = await getLogInternal(doc.fs, doc.dir, docId);
  return { log };
}

async function handleGetFileAt({ docId, filename, hash }) {
  const doc = getDoc(docId);
  if (!doc) throw new Error(`doc ${docId} not initialized`);
  const { fs: lfs, dir } = doc;

  try {
    // Resolve short hash via cache, then expandOid — avoids full log walk
    let oid = oidCache.get(docId)?.get(hash);
    if (!oid) {
      try {
        oid = await git.expandOid({ fs: lfs, dir, oid: hash });
      } catch (err) {
        console.error('[git-worker] handleGetFileAt expandOid failed:', err.message, err.stack);
        return { content: "" };
      }
    }

    const { blob } = await git.readBlob({
      fs: lfs,
      dir,
      oid,
      filepath: filename,
    });
    return { content: new TextDecoder().decode(blob) };
  } catch (err) {
    console.error('[git-worker] handleGetFileAt failed:', err.message, err.stack);
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
  } catch (err) {
    console.error('[git-worker] handleClone stat failed:', err.message, err.stack);
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

// ─── Squash commits (history rewrite) ───

async function handleSquash({ docId, filename, fromIndex, toIndex, message }) {
  const doc = getDoc(docId);
  if (!doc) throw new Error(`doc ${docId} not initialized`);
  clearTimeout(doc.pauseTimer);
  return squashCommits({ doc, docId, filename, fromIndex, toIndex, message, oidCache });
}

// ─── Delete commits (history rewrite) ───

async function handleDeleteCommits({ docId, filename, indices }) {
  const doc = getDoc(docId);
  if (!doc) throw new Error(`doc ${docId} not initialized`);
  clearTimeout(doc.pauseTimer);
  return deleteCommits({ doc, docId, filename, indices, oidCache });
}

// ─── Reorder commits (history rewrite) ───

async function handleReorder({ docId, filename, newOrder }) {
  const doc = getDoc(docId);
  if (!doc) throw new Error(`doc ${docId} not initialized`);
  clearTimeout(doc.pauseTimer);
  return reorderCommits({ doc, docId, filename, newOrder, oidCache });
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
  squash: handleSquash,
  deleteCommits: handleDeleteCommits,
  reorder: handleReorder,
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
