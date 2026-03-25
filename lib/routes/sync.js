const { Router } = require("express");
const GitOps = require("../GitOps");
const DocumentStore = require("../DocumentStore");

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "not authenticated" });
  next();
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

      // Remove the existing repo directory and recreate from scratch
      const repoDir = doc.repoPath;
      const fs = await import("fs/promises");
      try { await fs.rm(repoDir, { recursive: true, force: true }); } catch {}

      await GitOps.ensureRepo(repoDir, doc.filename);
      for (const c of commits) {
        await GitOps.writeFile(repoDir, doc.filename, c.content);
        await GitOps.commitFile(repoDir, doc.filename, c.message);
      }

      DocumentStore.touchLastModified(doc.doc_id);
      const log = await GitOps.getLog(repoDir, doc.filename);
      res.json({ ok: true, count: log.length });
    } catch (e) {
      console.error("[routes/sync] sync/rewrite failed:", e.message, e.stack);
      res.status(500).json({ error: "rewrite failed" });
    }
  });

  return router;
}

module.exports = createSyncRouter;
