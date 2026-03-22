#!/usr/bin/env node

/**
 * drift — server (multi-user)
 *
 * Each document gets its own git repo, session state, and WebSocket room.
 * No global mutable state. All git operations are async.
 *
 * Usage:
 *   node server.js [port]
 *
 * Defaults:
 *   port: 3377
 */

const express = require("express");
const { WebSocketServer } = require("ws");
const path = require("path");
const http = require("http");
const { nanoid } = require("nanoid");

const GitOps = require("./lib/GitOps");
const Session = require("./lib/Session");
const DocumentStore = require("./lib/DocumentStore");

const PORT = parseInt(process.env.PORT || process.argv[2] || "3377", 10);
const EVICTION_DELAY = 60_000; // 60s grace period before evicting idle sessions

// ─── Session map ───

const sessions = new Map(); // Map<docId, Session>

async function getOrCreateSession(docId) {
  if (sessions.has(docId)) return sessions.get(docId);
  const doc = DocumentStore.getDocument(docId);
  if (!doc) return null;
  const session = new Session(doc);
  await session.init();
  sessions.set(docId, session);
  return session;
}

function scheduleEviction(session) {
  session.evictionTimer = setTimeout(async () => {
    await session.flush();
    sessions.delete(session.docId);
    console.log(`  [${session.docId}] session evicted (no clients)`);
  }, EVICTION_DELAY);
}

// ─── Migrate legacy single-repo if it exists ───

async function migrateLegacyRepo() {
  const fs = require("fs");
  const legacyPath = path.resolve("./poem-repo");
  if (!fs.existsSync(legacyPath)) return;
  if (!fs.existsSync(path.join(legacyPath, ".git"))) return;

  const docId = nanoid(12);
  const targetPath = DocumentStore.repoPath(docId);
  fs.renameSync(legacyPath, targetPath);
  DocumentStore.createDocument(docId, "poem.txt", "migrated poem");
  console.log(`  migrated legacy repo → ${docId}`);
  console.log(`  open at: http://localhost:${PORT}/#/write/${docId}`);
}

// ─── HTTP server ───

const app = express();
const server = http.createServer(app);

app.use(express.json());

// Serve Vite build output if available, otherwise fall back to public/
const fs = require("fs");
const distDir = path.join(__dirname, "dist");
const staticDir = fs.existsSync(distDir) ? distDir : path.join(__dirname, "public");
app.use(express.static(staticDir));

// Document CRUD

app.post("/api/documents", async (req, res) => {
  try {
    const docId = nanoid(12);
    const filename = req.body.filename || "poem.txt";
    const title = req.body.title || "untitled";
    const doc = DocumentStore.createDocument(docId, filename, title);
    await GitOps.ensureRepo(doc.repoPath, filename);
    console.log(`  created document: ${docId}`);
    res.status(201).json({ docId, filename, title });
  } catch (e) {
    console.error("  create document failed:", e.message);
    res.status(500).json({ error: "failed to create document" });
  }
});

app.get("/api/documents", (req, res) => {
  res.json(DocumentStore.listDocuments());
});

app.get("/api/documents/:docId", (req, res) => {
  const doc = DocumentStore.getDocument(req.params.docId);
  if (!doc) return res.status(404).json({ error: "not found" });
  res.json(doc);
});

// Document-scoped API

app.get("/api/documents/:docId/file", async (req, res) => {
  const doc = DocumentStore.getDocument(req.params.docId);
  if (!doc) return res.status(404).json({ error: "not found" });
  const content = await GitOps.readFile(doc.repoPath, doc.filename);
  res.json({ content, filename: doc.filename });
});

app.get("/api/documents/:docId/log", async (req, res) => {
  const doc = DocumentStore.getDocument(req.params.docId);
  if (!doc) return res.status(404).json({ error: "not found" });
  const log = await GitOps.getLog(doc.repoPath, doc.filename);
  res.json(log);
});

app.get("/api/documents/:docId/snapshot/:hash", async (req, res) => {
  const doc = DocumentStore.getDocument(req.params.docId);
  if (!doc) return res.status(404).json({ error: "not found" });
  const content = await GitOps.getFileAt(doc.repoPath, req.params.hash, doc.filename);
  res.json({ content });
});

app.get("/api/documents/:docId/diff/:a/:b", async (req, res) => {
  const doc = DocumentStore.getDocument(req.params.docId);
  if (!doc) return res.status(404).json({ error: "not found" });
  const diff = await GitOps.getWordDiff(doc.repoPath, req.params.a, req.params.b, doc.filename);
  res.json({ diff });
});

app.get("/api/documents/:docId/structured-diff/:a/:b", async (req, res) => {
  const doc = DocumentStore.getDocument(req.params.docId);
  if (!doc) return res.status(404).json({ error: "not found" });
  const segments = await GitOps.getStructuredDiff(doc.repoPath, req.params.a, req.params.b, doc.filename);
  res.json({ segments });
});

app.get("/api/documents/:docId/playback", async (req, res) => {
  const doc = DocumentStore.getDocument(req.params.docId);
  if (!doc) return res.status(404).json({ error: "not found" });
  try {
    const log = await GitOps.getLog(doc.repoPath, doc.filename);
    if (log.length === 0) return res.json({ commits: [] });
    const commits = [];
    for (const c of log) {
      const content = await GitOps.getFileAt(doc.repoPath, c.hash, doc.filename);
      const lines = content.split("\n");
      if (lines[lines.length - 1] === "") lines.pop();
      commits.push({
        hash: c.hash.slice(0, 7),
        message: c.message,
        date: c.date || "",
        lines,
      });
    }
    res.json({ commits });
  } catch (e) {
    console.error("  playback data failed:", e.message);
    res.status(500).json({ error: "failed to generate playback data" });
  }
});

// Catch-all: serve index.html for client-side routing
app.get("*", (req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

// ─── WebSocket ───

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let session = null;

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // First message must be "join" to associate with a document
    if (msg.type === "join") {
      if (session) return; // already joined
      const docId = msg.docId;
      if (!docId || typeof docId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(docId)) {
        ws.send(JSON.stringify({ type: "error", message: "invalid docId" }));
        return;
      }

      session = await getOrCreateSession(docId);
      if (!session) {
        ws.send(JSON.stringify({ type: "error", message: "document not found" }));
        return;
      }

      session.addClient(ws);
      const content = await GitOps.readFile(session.repoPath, session.filename);
      const log = await GitOps.getLog(session.repoPath, session.filename);

      ws.send(JSON.stringify({
        type: "init",
        docId,
        content,
        filename: session.filename,
        log,
        pauseThreshold: session.pauseThreshold,
      }));

      console.log(`  [${docId}] writer connected (${session.clients.size} clients)`);
      return;
    }

    // All other messages require an active session
    if (!session) {
      ws.send(JSON.stringify({ type: "error", message: "must join a document first" }));
      return;
    }

    if (msg.type === "update") {
      const content = msg.content;
      if (typeof content !== "string" || content.length > 256 * 1024) return;
      await session.handleUpdate(ws, content);
      DocumentStore.touchLastModified(session.docId);
    }

    if (msg.type === "force-commit") {
      await session.handleForceCommit(msg.message);
      DocumentStore.touchLastModified(session.docId);
    }

    if (msg.type === "set-threshold") {
      session.setThreshold(msg.value);
    }
  });

  ws.on("close", () => {
    if (!session) return;
    const remaining = session.removeClient(ws);
    console.log(`  [${session.docId}] writer disconnected (${remaining} clients)`);
    if (remaining === 0) {
      scheduleEviction(session);
    }
  });
});

// ─── Startup ───

(async () => {
  await migrateLegacyRepo();

  server.listen(PORT, "0.0.0.0", () => {
    const docs = DocumentStore.listDocuments();
    console.log(`
┌─────────────────────────────────────┐
│                                     │
│   drift                             │
│   a writing instrument              │
│                                     │
│   http://localhost:${PORT}             │
│   documents: ${String(docs.length).padEnd(22)}│
│   mode: multi-user                  │
│                                     │
└─────────────────────────────────────┘
`);
  });
})();
