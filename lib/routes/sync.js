const { Router } = require("express");
const fs = require("fs/promises");
const GitOps = require("../GitOps");
const DocumentStore = require("../DocumentStore");

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "not authenticated" });
  next();
}

async function rebuildRepo(repoDir, filename, commits) {
  try { await fs.rm(repoDir, { recursive: true, force: true }); } catch {}
  await GitOps.ensureRepo(repoDir, filename);
  for (const c of commits) {
    await GitOps.writeFile(repoDir, filename, c.content);
    await GitOps.commitFile(repoDir, filename, c.message);
  }
}

async function readFullHistory(repoPath, filename) {
  const log = await GitOps.getLog(repoPath, filename);
  const snapshots = [];
  for (const c of log) {
    const content = await GitOps.getFileAt(repoPath, c.hash, filename);
    snapshots.push({ hash: c.hash, message: c.message, content });
  }
  return snapshots;
}

function createSyncRouter(sessions) {
  const router = Router();

  // Clone: full history as ordered commit array
  router.get("/api/documents/:docId/sync/clone", requireAuth, async (req, res) => {
    const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
    if (!doc) return res.status(404).json({ error: "not found" });
    try {
      const log = await GitOps.getLog(doc.repoPath, doc.filename);
      const commits = [];
      for (const c of log) {
        const content = await GitOps.getFileAt(doc.repoPath, c.hash, doc.filename);
        commits.push({
          hash: c.hash,
          message: c.message,
          date: c.date || "",
          content,
        });
      }
      res.json({ commits });
    } catch (e) {
      console.error("[routes/sync] sync/clone failed:", e.message, e.stack);
      res.status(500).json({ error: "clone failed" });
    }
  });

  // Pull: incremental commits after a given hash
  router.get("/api/documents/:docId/sync/pull", requireAuth, async (req, res) => {
    const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
    if (!doc) return res.status(404).json({ error: "not found" });
    try {
      const since = req.query.since;
      const log = await GitOps.getLog(doc.repoPath, doc.filename);

      let startIdx = 0;
      if (since) {
        const idx = log.findIndex((c) => c.hash.startsWith(since));
        if (idx >= 0) startIdx = idx + 1;
      }

      const newEntries = log.slice(startIdx);
      const commits = [];
      for (const c of newEntries) {
        const content = await GitOps.getFileAt(doc.repoPath, c.hash, doc.filename);
        commits.push({
          hash: c.hash,
          message: c.message,
          date: c.date || "",
          content,
        });
      }
      res.json({ commits });
    } catch (e) {
      console.error("[routes/sync] sync/pull failed:", e.message, e.stack);
      res.status(500).json({ error: "pull failed" });
    }
  });

  // Push: browser sends commits to server (idempotent)
  router.post("/api/documents/:docId/sync/push", requireAuth, async (req, res) => {
    const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
    if (!doc) return res.status(404).json({ error: "not found" });
    try {
      const { commits } = req.body;
      if (!Array.isArray(commits)) {
        return res.status(400).json({ error: "commits must be an array" });
      }

      await GitOps.ensureRepo(doc.repoPath, doc.filename);
      const accepted = [];
      for (const c of commits) {
        await GitOps.writeFile(doc.repoPath, doc.filename, c.content);
        const result = await GitOps.commitFile(doc.repoPath, doc.filename, c.message);
        if (result) accepted.push(c.hash);
      }

      DocumentStore.touchLastModified(doc.doc_id);
      const log = await GitOps.getLog(doc.repoPath, doc.filename);
      const lastHash = log.length > 0 ? log[log.length - 1].hash : null;
      res.json({ accepted, lastHash });
    } catch (e) {
      console.error("[routes/sync] sync/push failed:", e.message, e.stack);
      res.status(500).json({ error: "push failed" });
    }
  });

  // Full history rewrite (after squash/reorder)
  router.post("/api/documents/:docId/sync/rewrite", requireAuth, async (req, res) => {
    const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
    if (!doc) return res.status(404).json({ error: "not found" });
    try {
      const { commits } = req.body;
      if (!Array.isArray(commits)) {
        return res.status(400).json({ error: "commits must be an array" });
      }

      const session = sessions.get(req.params.docId);
      const doRewrite = () => rebuildRepo(doc.repoPath, doc.filename, commits);
      if (session) {
        await session.enqueueGitOp(doRewrite);
        clearTimeout(session.pauseTimer);
        session.lastContent = await GitOps.readFile(doc.repoPath, doc.filename);
      } else {
        await doRewrite();
      }

      DocumentStore.touchLastModified(doc.doc_id);
      const log = await GitOps.getLog(doc.repoPath, doc.filename);
      res.json({ ok: true, count: log.length });
    } catch (e) {
      console.error("[routes/sync] sync/rewrite failed:", e.message, e.stack);
      res.status(500).json({ error: "rewrite failed" });
    }
  });

  // ─── Server-side history operations (fallback when local git unavailable) ───

  router.post("/api/documents/:docId/history/delete", requireAuth, async (req, res) => {
    const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
    if (!doc) return res.status(404).json({ error: "not found" });
    try {
      const { indices } = req.body;
      if (!Array.isArray(indices) || indices.length === 0) {
        return res.status(400).json({ error: "indices must be a non-empty array" });
      }

      const snapshots = await readFullHistory(doc.repoPath, doc.filename);
      const indexSet = new Set(indices);
      const surviving = snapshots.filter((_, i) => !indexSet.has(i));
      if (surviving.length === 0) {
        return res.status(400).json({ error: "cannot delete all snapshots" });
      }

      const session = sessions.get(req.params.docId);
      const doRewrite = () => rebuildRepo(doc.repoPath, doc.filename, surviving);
      if (session) {
        await session.enqueueGitOp(doRewrite);
        clearTimeout(session.pauseTimer);
        session.lastContent = await GitOps.readFile(doc.repoPath, doc.filename);
      } else {
        await doRewrite();
      }

      DocumentStore.touchLastModified(doc.doc_id);
      const log = await GitOps.getLog(doc.repoPath, doc.filename);
      const content = await GitOps.readFile(doc.repoPath, doc.filename);
      res.json({ log, content });
    } catch (e) {
      console.error("[routes/sync] history/delete failed:", e.message, e.stack);
      res.status(500).json({ error: "delete failed" });
    }
  });

  router.post("/api/documents/:docId/history/reorder", requireAuth, async (req, res) => {
    const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
    if (!doc) return res.status(404).json({ error: "not found" });
    try {
      const { newOrder } = req.body;
      if (!Array.isArray(newOrder) || newOrder.length === 0) {
        return res.status(400).json({ error: "newOrder must be a non-empty array" });
      }

      const snapshots = await readFullHistory(doc.repoPath, doc.filename);
      const byHash = {};
      for (const s of snapshots) byHash[s.hash] = s;
      const reordered = newOrder.map(h => byHash[h]).filter(Boolean);
      if (reordered.length === 0) {
        return res.status(400).json({ error: "no valid commits in newOrder" });
      }

      const session = sessions.get(req.params.docId);
      const doRewrite = () => rebuildRepo(doc.repoPath, doc.filename, reordered);
      if (session) {
        await session.enqueueGitOp(doRewrite);
        clearTimeout(session.pauseTimer);
        session.lastContent = await GitOps.readFile(doc.repoPath, doc.filename);
      } else {
        await doRewrite();
      }

      DocumentStore.touchLastModified(doc.doc_id);
      const log = await GitOps.getLog(doc.repoPath, doc.filename);
      const content = await GitOps.readFile(doc.repoPath, doc.filename);
      res.json({ log, content });
    } catch (e) {
      console.error("[routes/sync] history/reorder failed:", e.message, e.stack);
      res.status(500).json({ error: "reorder failed" });
    }
  });

  router.post("/api/documents/:docId/history/squash", requireAuth, async (req, res) => {
    const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
    if (!doc) return res.status(404).json({ error: "not found" });
    try {
      const { fromIndex, toIndex, message } = req.body;
      if (typeof fromIndex !== "number" || typeof toIndex !== "number" || fromIndex > toIndex) {
        return res.status(400).json({ error: "invalid fromIndex/toIndex" });
      }

      const snapshots = await readFullHistory(doc.repoPath, doc.filename);
      if (toIndex >= snapshots.length) {
        return res.status(400).json({ error: "index out of range" });
      }

      const newPlan = [];
      for (let i = 0; i < snapshots.length; i++) {
        if (i === fromIndex) {
          newPlan.push({
            message: message || snapshots[toIndex].message,
            content: snapshots[toIndex].content,
          });
        } else if (i > fromIndex && i <= toIndex) {
          continue;
        } else {
          newPlan.push(snapshots[i]);
        }
      }

      const session = sessions.get(req.params.docId);
      const doRewrite = () => rebuildRepo(doc.repoPath, doc.filename, newPlan);
      if (session) {
        await session.enqueueGitOp(doRewrite);
        clearTimeout(session.pauseTimer);
        session.lastContent = await GitOps.readFile(doc.repoPath, doc.filename);
      } else {
        await doRewrite();
      }

      DocumentStore.touchLastModified(doc.doc_id);
      const log = await GitOps.getLog(doc.repoPath, doc.filename);
      const content = await GitOps.readFile(doc.repoPath, doc.filename);
      res.json({ log, content });
    } catch (e) {
      console.error("[routes/sync] history/squash failed:", e.message, e.stack);
      res.status(500).json({ error: "squash failed" });
    }
  });

  return router;
}

module.exports = createSyncRouter;
