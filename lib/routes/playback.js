const { Router } = require("express");
const GitOps = require("../GitOps");
const DocumentStore = require("../DocumentStore");

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "not authenticated" });
  next();
}

function createPlaybackRouter(sessions) {
  const router = Router();

  router.get("/api/documents/:docId/playback", requireAuth, async (req, res) => {
    const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
    if (!doc) return res.status(404).json({ error: "not found" });
    try {
      const log = await GitOps.getLog(doc.repoPath, doc.filename);
      if (log.length === 0) return res.json({ commits: [] });
      const commits = [];
      for (const c of log) {
        const raw = await GitOps.getFileAt(doc.repoPath, c.hash, doc.filename);
        // Strip HTML tags for playback (content may be rich text HTML)
        const plain = raw
          // Remove Tiptap/ProseMirror trailing breaks inside paragraphs
          .replace(/<br\s*(?:class="[^"]*")?\s*\/?>\s*<\/p>/gi, '</p>')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
          .replace(/<\/?p[^>]*>/gi, '')
          .replace(/<[^>]*>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/^\n+|\n+$/g, '');
        const lines = plain.split("\n");
        if (lines[lines.length - 1] === "") lines.pop();
        commits.push({
          hash: c.hash.slice(0, 7),
          message: c.message,
          date: c.date || "",
          lines,
          html: raw,
        });
      }
      res.json({ commits });
    } catch (e) {
      console.error("[routes/playback] playback data failed:", e.message, e.stack);
      res.status(500).json({ error: "failed to generate playback data" });
    }
  });

  return router;
}

module.exports = createPlaybackRouter;
