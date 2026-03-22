/**
 * DocumentStore — SQLite-backed document metadata for drift
 *
 * Stores document metadata only (not content — git owns content).
 * Each document maps to a git repo at data/repos/<docId>/.
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DRIFT_DATA_DIR || path.resolve(__dirname, "..", "data");
const REPOS_DIR = path.join(DATA_DIR, "repos");
const DB_PATH = path.join(DATA_DIR, "drift.db");

// Ensure dirs exist
fs.mkdirSync(REPOS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    doc_id        TEXT PRIMARY KEY,
    filename      TEXT NOT NULL DEFAULT 'poem.txt',
    title         TEXT DEFAULT 'untitled',
    owner_id      TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_modified TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

function repoPath(docId) {
  return path.join(REPOS_DIR, docId);
}

function createDocument(docId, filename = "poem.txt", title = "untitled") {
  db.prepare(
    "INSERT INTO documents (doc_id, filename, title) VALUES (?, ?, ?)"
  ).run(docId, filename, title);
  return { doc_id: docId, filename, title, repoPath: repoPath(docId) };
}

function getDocument(docId) {
  const row = db.prepare("SELECT * FROM documents WHERE doc_id = ?").get(docId);
  if (!row) return null;
  return { ...row, repoPath: repoPath(row.doc_id) };
}

function listDocuments() {
  const rows = db.prepare(
    "SELECT * FROM documents ORDER BY last_modified DESC"
  ).all();
  return rows.map((r) => ({ ...r, repoPath: repoPath(r.doc_id) }));
}

function updateTitle(docId, title) {
  db.prepare("UPDATE documents SET title = ? WHERE doc_id = ?").run(title, docId);
}

function updateFilename(docId, filename) {
  db.prepare("UPDATE documents SET filename = ? WHERE doc_id = ?").run(filename, docId);
}

function touchLastModified(docId) {
  db.prepare(
    "UPDATE documents SET last_modified = datetime('now') WHERE doc_id = ?"
  ).run(docId);
}

function deleteDocument(docId) {
  db.prepare("DELETE FROM documents WHERE doc_id = ?").run(docId);
  // Caller is responsible for deleting the repo directory
}

module.exports = {
  repoPath,
  createDocument,
  getDocument,
  listDocuments,
  updateTitle,
  updateFilename,
  touchLastModified,
  deleteDocument,
  DATA_DIR,
  REPOS_DIR,
};
