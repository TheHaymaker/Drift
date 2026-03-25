const { WebSocketServer } = require("ws");
const http = require("http");
const GitOps = require("./GitOps");
const Session = require("./Session");
const DocumentStore = require("./DocumentStore");

function handleWebSocketUpgrade(server, sessions, sessionMiddleware) {
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

        session = await getOrCreateSession(sessions, docId);
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
        session.handleUpdate(ws, content).catch(err =>
          console.error('[ws] handleUpdate error for doc', session.docId, ':', err)
        );
        DocumentStore.touchLastModified(session.docId);
      }

      if (msg.type === "force-commit") {
        session.handleForceCommit(msg.message).catch(err =>
          console.error('[ws] handleForceCommit error for doc', session.docId, ':', err)
        );
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
        scheduleEviction(sessions, session);
      }
    });
  });
}

async function getOrCreateSession(sessions, docId) {
  if (sessions.has(docId)) return sessions.get(docId);
  const doc = DocumentStore.getDocument(docId);
  if (!doc) return null;
  const session = new Session(doc);
  await session.init();
  sessions.set(docId, session);
  return session;
}

const EVICTION_DELAY = 60_000; // 60s grace period before evicting idle sessions

function scheduleEviction(sessions, session) {
  session.evictionTimer = setTimeout(async () => {
    await session.flush();
    sessions.delete(session.docId);
    console.log(`  [${session.docId}] session evicted (no clients)`);
  }, EVICTION_DELAY);
}

module.exports = { handleWebSocketUpgrade };
