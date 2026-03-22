/**
 * git-client.js — Promise-based wrapper around the git Web Worker
 *
 * Each method sends a message to the worker and returns a Promise
 * resolved when the worker responds with the matching msgId.
 * Also supports unsolicited "committed" events from the worker's pause timer.
 */

export function createGitClient() {
  const worker = new Worker(
    new URL("./worker/git-worker.js", import.meta.url),
    { type: "module" }
  );

  let nextId = 1;
  const pending = new Map(); // Map<msgId, { resolve, reject }>
  const commitListeners = [];

  worker.onmessage = (e) => {
    const { msgId, ...data } = e.data;

    // Unsolicited event from pause timer
    if (msgId === undefined && data.type === "committed") {
      for (const cb of commitListeners) {
        try { cb(data); } catch {}
      }
      return;
    }

    const entry = pending.get(msgId);
    if (!entry) return;
    pending.delete(msgId);

    if (data.error) {
      entry.reject(new Error(data.error));
    } else {
      entry.resolve(data);
    }
  };

  worker.onerror = (e) => {
    console.error("[git-client] worker error:", e);
  };

  function send(type, payload) {
    const msgId = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(msgId, { resolve, reject });
      worker.postMessage({ msgId, type, ...payload });
    });
  }

  return {
    init(params) {
      return send("init", params);
    },
    writeFile(params) {
      return send("writeFile", params);
    },
    commit(params) {
      return send("commit", params);
    },
    forceCommit(params) {
      return send("forceCommit", params);
    },
    readFile(params) {
      return send("readFile", params);
    },
    getLog(params) {
      return send("getLog", params);
    },
    getFileAt(params) {
      return send("getFileAt", params);
    },
    getStructuredDiff(params) {
      return send("getStructuredDiff", params);
    },
    clone(params) {
      return send("clone", params);
    },
    setThreshold(params) {
      return send("setThreshold", params);
    },
    onCommit(callback) {
      commitListeners.push(callback);
      return () => {
        const idx = commitListeners.indexOf(callback);
        if (idx >= 0) commitListeners.splice(idx, 1);
      };
    },
    destroy() {
      worker.terminate();
      for (const { reject } of pending.values()) {
        reject(new Error("worker terminated"));
      }
      pending.clear();
    },
  };
}
