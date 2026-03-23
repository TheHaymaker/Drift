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
const UserStore = require("./lib/UserStore");
const sessionMiddleware = require("./lib/sessionMiddleware");

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

app.set("trust proxy", 1); // trust Fly.io reverse proxy for secure cookies
app.use(express.json());
app.use(sessionMiddleware);

// Serve Vite build output if available, otherwise fall back to public/
const fs = require("fs");
const distDir = path.join(__dirname, "dist");
const staticDir = fs.existsSync(distDir) ? distDir : path.join(__dirname, "public");
app.use(express.static(staticDir));

// ─── Auth routes ───

app.post("/api/auth/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || typeof username !== "string" || !/^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]?$/.test(username)) {
    return res.status(400).json({ error: "username must be 2-30 lowercase alphanumeric/hyphen characters" });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }
  try {
    const user = UserStore.createUser(username, password);
    req.session.userId = user.user_id;
    res.status(201).json(user);
  } catch (e) {
    if (e.message.includes("UNIQUE")) {
      return res.status(409).json({ error: "username already taken" });
    }
    console.error("  register failed:", e.message);
    res.status(500).json({ error: "registration failed" });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }
  const user = UserStore.authenticateUser(username, password);
  if (!user) return res.status(401).json({ error: "invalid credentials" });
  req.session.userId = user.user_id;
  res.json(user);
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "not authenticated" });
  const user = UserStore.getUser(req.session.userId);
  if (!user) return res.status(401).json({ error: "not authenticated" });
  res.json({ user_id: user.user_id, username: user.username });
});

// ─── Rhyme API (CMU dictionary) ───

const CmuDict = require("./lib/CmuDict");

app.get("/api/rhyme", (req, res) => {
  const raw = req.query.words;
  if (!raw) return res.status(400).json({ error: "words parameter required" });

  const words = raw.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (words.length === 0) return res.status(400).json({ error: "no words provided" });
  if (words.length > 200) return res.status(400).json({ error: "too many words (max 200)" });

  const result = {};
  for (const w of words) {
    result[w] = CmuDict.getRhymeSuffix(w);
  }
  res.json(result);
});

// ─── Auth middleware for document routes ───

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "not authenticated" });
  next();
}

// Document CRUD

app.post("/api/documents", requireAuth, async (req, res) => {
  try {
    const docId = nanoid(12);
    const filename = req.body.filename || "poem.txt";
    const title = req.body.title || "untitled";
    const doc = DocumentStore.createDocument(docId, filename, title, req.session.userId);
    await GitOps.ensureRepo(doc.repoPath, filename);
    console.log(`  created document: ${docId}`);
    res.status(201).json({ docId, filename, title });
  } catch (e) {
    console.error("  create document failed:", e.message);
    res.status(500).json({ error: "failed to create document" });
  }
});

app.get("/api/documents", requireAuth, (req, res) => {
  res.json(DocumentStore.listDocuments(req.session.userId));
});

app.get("/api/documents/:docId", requireAuth, (req, res) => {
  const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
  if (!doc) return res.status(404).json({ error: "not found" });
  res.json(doc);
});

// Rename title and/or filename
app.patch("/api/documents/:docId", requireAuth, async (req, res) => {
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
    console.error("  rename failed:", e.message);
    res.status(500).json({ error: "rename failed" });
  }
});

// Delete document
app.delete("/api/documents/:docId", requireAuth, async (req, res) => {
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
    console.error("  delete failed:", e.message);
    res.status(500).json({ error: "delete failed" });
  }
});

function isValidFilename(name) {
  if (!name || typeof name !== "string") return false;
  if (name.length > 100) return false;
  if (/[\/\\]/.test(name)) return false;
  if (name.startsWith(".")) return false;
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) return false;
  return true;
}

// Document-scoped API

app.get("/api/documents/:docId/file", requireAuth, async (req, res) => {
  const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
  if (!doc) return res.status(404).json({ error: "not found" });
  const content = await GitOps.readFile(doc.repoPath, doc.filename);
  res.json({ content, filename: doc.filename });
});

app.get("/api/documents/:docId/log", requireAuth, async (req, res) => {
  const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
  if (!doc) return res.status(404).json({ error: "not found" });
  const log = await GitOps.getLog(doc.repoPath, doc.filename);
  res.json(log);
});

app.get("/api/documents/:docId/snapshot/:hash", requireAuth, async (req, res) => {
  const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
  if (!doc) return res.status(404).json({ error: "not found" });
  const content = await GitOps.getFileAt(doc.repoPath, req.params.hash, doc.filename);
  res.json({ content });
});

app.get("/api/documents/:docId/diff/:a/:b", requireAuth, async (req, res) => {
  const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
  if (!doc) return res.status(404).json({ error: "not found" });
  const diff = await GitOps.getWordDiff(doc.repoPath, req.params.a, req.params.b, doc.filename);
  res.json({ diff });
});

app.get("/api/documents/:docId/structured-diff/:a/:b", requireAuth, async (req, res) => {
  const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
  if (!doc) return res.status(404).json({ error: "not found" });
  const segments = await GitOps.getStructuredDiff(doc.repoPath, req.params.a, req.params.b, doc.filename);
  res.json({ segments });
});

app.get("/api/documents/:docId/playback", requireAuth, async (req, res) => {
  const doc = DocumentStore.getDocumentForOwner(req.params.docId, req.session.userId);
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

// ─── Sync endpoints (browser-to-server git sync) ───

// Clone: full history as ordered commit array
app.get("/api/documents/:docId/sync/clone", requireAuth, async (req, res) => {
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
    console.error("  sync/clone failed:", e.message);
    res.status(500).json({ error: "clone failed" });
  }
});

// Pull: incremental commits after a given hash
app.get("/api/documents/:docId/sync/pull", requireAuth, async (req, res) => {
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
    console.error("  sync/pull failed:", e.message);
    res.status(500).json({ error: "pull failed" });
  }
});

// Push: browser sends commits to server (idempotent)
app.post("/api/documents/:docId/sync/push", requireAuth, async (req, res) => {
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
    console.error("  sync/push failed:", e.message);
    res.status(500).json({ error: "push failed" });
  }
});

// Catch-all: serve index.html for client-side routing
app.get("*", (req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

// ─── WebSocket ───

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  let session = null;
  let userId = null;

  // Parse session from upgrade request cookie
  const dummyRes = Object.create(http.ServerResponse.prototype);
  sessionMiddleware(req, dummyRes, () => {
    if (req.session && req.session.userId) {
      userId = req.session.userId;
    }
  });

  if (!userId) {
    ws.send(JSON.stringify({ type: "error", message: "not authenticated" }));
    ws.close();
    return;
  }

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

      // Verify ownership
      const doc = DocumentStore.getDocumentForOwner(docId, userId);
      if (!doc) {
        ws.send(JSON.stringify({ type: "error", message: "document not found" }));
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

    // Lightweight typing indicator — broadcast to other clients without disk I/O
    if (msg.type === "typing") {
      session.broadcast({ type: "typing", length: msg.length }, ws);
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

  // Claim orphaned documents (owner_id IS NULL) for a specific user
  const legacyOwner = process.env.DRIFT_LEGACY_OWNER;
  if (legacyOwner) {
    const user = UserStore.getUserByUsername(legacyOwner);
    if (user) {
      const result = DocumentStore.claimOrphanedDocuments(user.user_id);
      if (result.changes > 0) {
        console.log(`  claimed ${result.changes} orphaned document(s) for user "${legacyOwner}"`);
      }
    }
  }

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
