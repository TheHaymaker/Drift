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
const path = require("path");
const http = require("http");
const { nanoid } = require("nanoid");
const fs = require("fs");

const DocumentStore = require("./lib/DocumentStore");
const UserStore = require("./lib/UserStore");
const sessionMiddleware = require("./lib/sessionMiddleware");
const CmuDict = require("./lib/CmuDict");

const createAuthRouter = require("./lib/routes/auth");
const createDocumentsRouter = require("./lib/routes/documents");
const createSyncRouter = require("./lib/routes/sync");
const createPlaybackRouter = require("./lib/routes/playback");
const { handleWebSocketUpgrade } = require("./lib/wsHandler");

const PORT = parseInt(process.env.PORT || process.argv[2] || "3377", 10);

// ─── Session map ───

const sessions = new Map(); // Map<docId, Session>

// ─── Migrate legacy single-repo if it exists ───

async function migrateLegacyRepo() {
  const fsSync = require("fs");
  const legacyPath = path.resolve("./poem-repo");
  if (!fsSync.existsSync(legacyPath)) return;
  if (!fsSync.existsSync(path.join(legacyPath, ".git"))) return;

  const docId = nanoid(12);
  const targetPath = DocumentStore.repoPath(docId);
  fsSync.renameSync(legacyPath, targetPath);
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
const distDir = path.join(__dirname, "dist");
const staticDir = fs.existsSync(distDir) ? distDir : path.join(__dirname, "public");
app.use(express.static(staticDir));

// ─── Health check (used by fly.io to detect readiness) ───
app.get("/api/health", (req, res) => {
  const docs = DocumentStore.listDocuments();
  let reposOnDisk = 0;
  try {
    reposOnDisk = fs.readdirSync(DocumentStore.REPOS_DIR).filter((f) =>
      fs.statSync(path.join(DocumentStore.REPOS_DIR, f)).isDirectory()
    ).length;
  } catch (e) { /* repos dir may not exist yet */ }
  res.json({ status: "ok", documents: docs.length, reposOnDisk, dataDir: DocumentStore.DATA_DIR });
});

// ─── Auth routes ───
app.use(createAuthRouter());

// ─── Rhyme API (CMU dictionary) ───

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

// ─── Document, sync, and playback routes ───
app.use(createDocumentsRouter(sessions));
app.use(createSyncRouter(sessions));
app.use(createPlaybackRouter(sessions));

// Catch-all: serve index.html for client-side routing
app.get("*", (req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

// ─── WebSocket ───

handleWebSocketUpgrade(server, sessions, sessionMiddleware);

// ─── Graceful shutdown (flush SQLite WAL before Fly.io stops the machine) ───

process.on("SIGTERM", () => {
  console.log("SIGTERM received — flushing WAL and shutting down");
  const { db } = require("./lib/db");
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.close();
  process.exit(0);
});

// ─── Volume integrity check ───

function checkVolumeIntegrity() {
  const dataDir = DocumentStore.DATA_DIR;
  const reposDir = DocumentStore.REPOS_DIR;

  let repoDirCount = 0;
  try {
    repoDirCount = fs.readdirSync(reposDir).filter((f) =>
      fs.statSync(path.join(reposDir, f)).isDirectory()
    ).length;
  } catch (e) { /* repos dir may not exist yet */ }

  const docs = DocumentStore.listDocuments();
  const { db } = require("./lib/db");
  const userCount = db.prepare("SELECT count(*) as count FROM users").get().count;

  console.log(`  volume check: ${docs.length} docs, ${repoDirCount} repos on disk, ${userCount} users`);

  if (docs.length === 0 && repoDirCount === 0 && userCount === 0) {
    console.warn("  ⚠ WARNING: Volume appears empty — possible volume reset or new volume attached");
    console.warn(`  ⚠ Data directory: ${dataDir}`);
  } else if (docs.length !== repoDirCount) {
    console.warn(`  ⚠ WARNING: DB/disk mismatch — ${docs.length} docs in DB vs ${repoDirCount} repos on disk`);
  }
}

// ─── Startup ───

(async () => {
  checkVolumeIntegrity();
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
