/**
 * Shared SQLite database instance for drift
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DRIFT_DATA_DIR || path.resolve(__dirname, "..", "data");
const REPOS_DIR = path.join(DATA_DIR, "repos");
const DB_PATH = path.join(DATA_DIR, "drift.db");

fs.mkdirSync(REPOS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

module.exports = { db, DATA_DIR, REPOS_DIR };
