/**
 * Minimal express-session store backed by SQLite
 */

const { db } = require("./db");
const session = require("express-session");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )
`);

class SqliteSessionStore extends session.Store {
  get(sid, cb) {
    const row = db.prepare("SELECT data, expires_at FROM sessions WHERE sid = ?").get(sid);
    if (!row) return cb(null, null);
    if (row.expires_at < Date.now()) {
      db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
      return cb(null, null);
    }
    try { cb(null, JSON.parse(row.data)); } catch (e) { cb(e); }
  }

  set(sid, sessionData, cb) {
    const maxAge = sessionData.cookie && sessionData.cookie.maxAge;
    const expires = Date.now() + (maxAge || 30 * 24 * 60 * 60 * 1000);
    const data = JSON.stringify(sessionData);
    db.prepare(
      "INSERT OR REPLACE INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)"
    ).run(sid, data, expires);
    cb && cb(null);
  }

  destroy(sid, cb) {
    db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
    cb && cb(null);
  }

  touch(sid, sessionData, cb) {
    const maxAge = sessionData.cookie && sessionData.cookie.maxAge;
    const expires = Date.now() + (maxAge || 30 * 24 * 60 * 60 * 1000);
    db.prepare("UPDATE sessions SET expires_at = ? WHERE sid = ?").run(expires, sid);
    cb && cb(null);
  }
}

module.exports = SqliteSessionStore;
