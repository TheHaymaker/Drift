const { Router } = require("express");
const UserStore = require("../UserStore");

function createAuthRouter() {
  const router = Router();

  router.post("/api/auth/register", (req, res) => {
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
      req.session.save((err) => {
        if (err) {
          console.error("[routes/auth] session save failed:", err);
          return res.status(500).json({ error: "session error" });
        }
        res.status(201).json(user);
      });
    } catch (e) {
      if (e.message.includes("UNIQUE")) {
        return res.status(409).json({ error: "username already taken" });
      }
      console.error("[routes/auth] register failed:", e.message, e.stack);
      res.status(500).json({ error: "registration failed" });
    }
  });

  router.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "username and password required" });
    }
    const user = UserStore.authenticateUser(username, password);
    if (!user) return res.status(401).json({ error: "invalid credentials" });
    req.session.userId = user.user_id;
    req.session.save((err) => {
      if (err) {
        console.error("[routes/auth] session save failed:", err);
        return res.status(500).json({ error: "session error" });
      }
      res.json(user);
    });
  });

  router.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.status(204).end());
  });

  router.get("/api/auth/me", (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "not authenticated" });
    const user = UserStore.getUser(req.session.userId);
    if (!user) return res.status(401).json({ error: "not authenticated" });
    res.json({ user_id: user.user_id, username: user.username });
  });

  return router;
}

module.exports = createAuthRouter;
