/**
 * Express session middleware for drift (shared by HTTP + WebSocket)
 */

const session = require("express-session");
const SqliteSessionStore = require("./SqliteSessionStore");

module.exports = session({
  store: new SqliteSessionStore(),
  secret: process.env.DRIFT_SESSION_SECRET || "drift-dev-secret-change-in-prod",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
});
