/**
 * sync.js — Push/pull orchestrator for browser-to-server git sync
 *
 * After local commits, pushes them to the server's canonical repo.
 * On init, pulls any commits the browser doesn't have.
 * Uses custom REST endpoints (not git smart HTTP protocol).
 */

/**
 * @param {string} docId
 * @param {string} filename
 * @param {object} gitClient - git-client.js instance
 * @returns {{ pushCommit, pull, destroy, getStatus }}
 */
export function createSyncClient(docId, filename, gitClient) {
  let pushQueue = [];
  let pushing = false;
  let pushDebounceTimer = null;
  let destroyed = false;
  let syncStatus = "synced"; // 'synced' | 'pending' | 'pushing' | 'error'
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const PUSH_DEBOUNCE = 5000;

  async function doPush() {
    if (destroyed || pushQueue.length === 0 || pushing) return;
    pushing = true;
    syncStatus = "pushing";

    const batch = [...pushQueue];
    pushQueue = [];

    try {
      // Get the content at each commit hash to send to server
      const commits = [];
      for (const c of batch) {
        let content = "";
        try {
          const result = await gitClient.getFileAt({
            docId,
            filename,
            hash: c.hash,
          });
          content = result.content;
        } catch {
          // If we can't read the content, skip this commit
          continue;
        }
        commits.push({
          hash: c.hash,
          message: c.message,
          date: c.date || new Date().toISOString(),
          content,
        });
      }

      if (commits.length === 0) {
        pushing = false;
        syncStatus = pushQueue.length > 0 ? "pending" : "synced";
        return;
      }

      const res = await fetch(`/api/documents/${docId}/sync/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commits }),
      });

      if (!res.ok) {
        throw new Error(`push failed: ${res.status}`);
      }

      retryCount = 0;
      syncStatus = pushQueue.length > 0 ? "pending" : "synced";
    } catch (err) {
      console.error("[sync] push failed:", err);
      // Put failed commits back at the front of the queue
      pushQueue = [...batch, ...pushQueue];
      retryCount++;

      if (retryCount <= MAX_RETRIES) {
        syncStatus = "pending";
        // Exponential backoff retry
        const delay = Math.min(2000 * Math.pow(2, retryCount - 1), 16000);
        setTimeout(() => {
          if (!destroyed) doPush();
        }, delay);
      } else {
        syncStatus = "error";
      }
    } finally {
      pushing = false;
    }

    // Process any commits that arrived while we were pushing
    if (pushQueue.length > 0 && !destroyed) {
      schedulePush();
    }
  }

  function schedulePush() {
    clearTimeout(pushDebounceTimer);
    syncStatus = "pending";
    pushDebounceTimer = setTimeout(() => {
      if (!destroyed) doPush();
    }, PUSH_DEBOUNCE);
  }

  return {
    pushCommit(commitData) {
      pushQueue.push(commitData);
      schedulePush();
    },

    async pull() {
      try {
        // Get local log to find what we already have
        const localLog = await gitClient.getLog({ docId });
        const localHashes = new Set(localLog.log.map((c) => c.hash));

        let url;
        if (localLog.log.length === 0) {
          url = `/api/documents/${docId}/sync/clone`;
        } else {
          const lastHash = localLog.log[localLog.log.length - 1].hash;
          url = `/api/documents/${docId}/sync/pull?since=${lastHash}`;
        }

        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        if (data.commits && data.commits.length > 0) {
          // Filter out commits we already have
          const newCommits = data.commits.filter(
            (c) => !localHashes.has(c.hash.slice(0, 7))
          );
          if (newCommits.length > 0) {
            await gitClient.clone({ docId, filename, commits: newCommits });
          }
        }
      } catch (err) {
        console.error("[sync] pull failed:", err);
      }
    },

    getStatus() {
      return {
        syncStatus,
        pending: pushQueue.length,
      };
    },

    destroy() {
      destroyed = true;
      clearTimeout(pushDebounceTimer);
    },
  };
}
