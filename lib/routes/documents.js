const { Router } = require("express");
const { nanoid } = require("nanoid");
const GitOps = require("../GitOps");
const DocumentStore = require("../DocumentStore");

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "not authenticated" });
  next();
}

function isValidFilename(name) {
  if (!name || typeof name !== "string") return false;
  if (name.length > 100) return false;
  if (/[\/\\]/.test(name)) return false;
  if (name.startsWith(".")) return false;
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) return false;
  return true;
}

function createDocumentsRouter(sessions) {
  const router = Router();

  router.post("/api/documents", requireAuth, async (req, res) => {
    try {
      const docId = nanoid(12);
      const filename = req.body.filename || "poem.txt";
      const title = req.body.title || "untitled";
      const doc = DocumentStore.createDocument(docId, filename, title, req.session.userId);
      await GitOps.ensureRepo(doc.repoPath, filename);
      console.log(`  created document: ${docId}`);
      res.status(201).json({ docId, filename, title });
    } catch (e) {
      console.error("[routes/documents] create document failed:", e.message, e.stack);
      res.status(500).json({ error: "failed to create document" });
    }
  });

  router.get("/api/documents", requireAuth, (req, res) => {
    res.json(DocumentStore.listDocuments(req.session.userId));
  });

  router.get("/api/documents/:docId", requireAuth, (req, res) => {
    const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
    if (!doc) return res.status(404).json({ error: "not found" });
    res.json(doc);
  });

  // Rename title and/or filename
  router.patch("/api/documents/:docId", requireAuth, async (req, res) => {
    try {
      const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
      if (!doc) return res.status(404).json({ error: "not found" });

      const { title, filename } = req.body;

      if (title && typeof title === "string") {
        DocumentStore.updateTitle(doc.doc_id, title.trim());
      }

      if (filename && typeof filename === "string" && filename !== doc.filename) {
        if (!isValidFilename(filename)) {
          return res.status(400).json({ error: "invalid filename" });
        }
        await GitOps.renameFile(doc.repoPath, doc.filename, filename);
        DocumentStore.updateFilename(doc.doc_id, filename);

        // Update active session if exists
        const session = sessions.get(doc.doc_id);
        if (session) {
          session.filename = filename;
          for (const client of session.clients) {
            client.send(JSON.stringify({ type: "renamed", filename }));
          }
        }
      }

      DocumentStore.touchLastModified(doc.doc_id);
      res.json(DocumentStore.getDocument(doc.doc_id));
    } catch (e) {
      console.error("[routes/documents] rename failed:", e.message, e.stack);
      res.status(500).json({ error: "rename failed" });
    }
  });

  // Delete document
  router.delete("/api/documents/:docId", requireAuth, async (req, res) => {
    try {
      const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
      if (!doc) return res.status(404).json({ error: "not found" });

      // Evict active session
      const session = sessions.get(doc.doc_id);
      if (session) {
        await session.flush();
        for (const client of session.clients) {
          client.send(JSON.stringify({ type: "deleted" }));
          client.close();
        }
        if (session.evictionTimer) clearTimeout(session.evictionTimer);
        sessions.delete(doc.doc_id);
      }

      DocumentStore.deleteDocument(doc.doc_id);
      await require("fs/promises").rm(doc.repoPath, { recursive: true, force: true });
      console.log(`  deleted document: ${doc.doc_id}`);
      res.status(204).end();
    } catch (e) {
      console.error("[routes/documents] delete failed:", e.message, e.stack);
      res.status(500).json({ error: "delete failed" });
    }
  });

  router.get("/api/documents/:docId/file", requireAuth, async (req, res) => {
    const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
    if (!doc) return res.status(404).json({ error: "not found" });
    const content = await GitOps.readFile(doc.repoPath, doc.filename);
    res.json({ content, filename: doc.filename });
  });

  router.get("/api/documents/:docId/log", requireAuth, async (req, res) => {
    const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
    if (!doc) return res.status(404).json({ error: "not found" });
    const log = await GitOps.getLog(doc.repoPath, doc.filename);
    res.json(log);
  });

  router.get("/api/documents/:docId/snapshot/:hash", requireAuth, async (req, res) => {
    const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
    if (!doc) return res.status(404).json({ error: "not found" });
    const content = await GitOps.getFileAt(doc.repoPath, req.params.hash, doc.filename);
    res.json({ content });
  });

  router.get("/api/documents/:docId/diff/:a/:b", requireAuth, async (req, res) => {
    const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
    if (!doc) return res.status(404).json({ error: "not found" });
    const diff = await GitOps.getWordDiff(doc.repoPath, req.params.a, req.params.b, doc.filename);
    res.json({ diff });
  });

  router.get("/api/documents/:docId/structured-diff/:a/:b", requireAuth, async (req, res) => {
    const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
    if (!doc) return res.status(404).json({ error: "not found" });
    const segments = await GitOps.getStructuredDiff(doc.repoPath, req.params.a, req.params.b, doc.filename);
    res.json({ segments });
  });

  return router;
}

module.exports = createDocumentsRouter;
