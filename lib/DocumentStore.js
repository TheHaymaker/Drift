/**
 * DocumentStore — SQLite-backed document metadata for drift
 *
 * Stores document metadata only (not content — git owns content).
 * Each document maps to a git repo at data/repos/<docId>/.
 */

const path = require("path");
const { db, REPOS_DIR, DATA_DIR } = require("./db");

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

function createDocument(docId, filename = "poem.txt", title = "untitled", ownerId = null) {
  db.prepare(
    "INSERT INTO documents (doc_id, filename, title, owner_id) VALUES (?, ?, ?, ?)"
  ).run(docId, filename, title, ownerId);
  return { doc_id: docId, filename, title, owner_id: ownerId, repoPath: repoPath(docId) };
}

function getDocument(docId) {
  const row = db.prepare("SELECT * FROM documents WHERE doc_id = ?").get(docId);
  if (!row) return null;
  return { ...row, repoPath: repoPath(row.doc_id) };
}

function listDocuments(ownerId = null) {
  const rows = ownerId
    ? db.prepare("SELECT * FROM documents WHERE owner_id = ? ORDER BY last_modified DESC").all(ownerId)
    : db.prepare("SELECT * FROM documents ORDER BY last_modified DESC").all();
  return rows.map((r) => ({ ...r, repoPath: repoPath(r.doc_id) }));
}

function getDocumentForOwner(docId, ownerId) {
  const row = db.prepare("SELECT * FROM documents WHERE doc_id = ? AND owner_id = ?").get(docId, ownerId);
  if (!row) return null;
  return { ...row, repoPath: repoPath(row.doc_id) };
}

function claimOrphanedDocuments(ownerId) {
  return db.prepare("UPDATE documents SET owner_id = ? WHERE owner_id IS NULL").run(ownerId);
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
  getDocumentForOwner,
  listDocuments,
  updateTitle,
  updateFilename,
  touchLastModified,
  deleteDocument,
  claimOrphanedDocuments,
  DATA_DIR,
  REPOS_DIR,
};
