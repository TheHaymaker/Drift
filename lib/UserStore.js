/**
 * UserStore — SQLite-backed user accounts for drift
 */

const { db } = require("./db");
const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id    TEXT PRIMARY KEY,
    username   TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const SALT_ROUNDS = 10;

function createUser(username, password) {
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const userId = nanoid(12);
  db.prepare("INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)").run(userId, username, hash);
  return { user_id: userId, username };
}

function authenticateUser(username, password) {
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password)) return null;
  return { user_id: row.user_id, username: row.username };
}

function getUser(userId) {
  const row = db.prepare("SELECT user_id, username, created_at FROM users WHERE user_id = ?").get(userId);
  return row || null;
}

function getUserByUsername(username) {
  const row = db.prepare("SELECT user_id, username, created_at FROM users WHERE username = ?").get(username);
  return row || null;
}

module.exports = { createUser, authenticateUser, getUser, getUserByUsername };
