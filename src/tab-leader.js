/**
 * tab-leader.js — Multi-tab leader election via BroadcastChannel
 *
 * Only the leader tab runs the git Web Worker for a given docId.
 * Follower tabs relay writes to the leader and receive committed events back.
 *
 * Protocol:
 * 1. On join, broadcast { type: "election", tabId, timestamp }
 * 2. Wait 200ms. Lowest tabId wins.
 * 3. Leader broadcasts { type: "leader", tabId }
 * 4. On leader beforeunload, broadcast { type: "abdicate" } → re-election
 * 5. Followers send { type: "write", content } and receive { type: "committed", ... }
 */

const tabId = crypto.randomUUID();

/**
 * @param {string} docId
 * @returns {{ isLeader: () => boolean, onLeaderChange: (cb) => () => void, relayWrite: (content) => void, onCommitted: (cb) => () => void, destroy: () => void }}
 */
export function electLeader(docId) {
  const channel = new BroadcastChannel(`drift-leader-${docId}`);
  let leader = null;
  let electionTimeout = null;
  const candidates = new Map(); // tabId → timestamp
  const leaderChangeListeners = [];
  const committedListeners = [];

  function startElection() {
    leader = null;
    candidates.clear();
    const now = Date.now();
    candidates.set(tabId, now);
    channel.postMessage({ type: "election", tabId, timestamp: now });

    clearTimeout(electionTimeout);
    electionTimeout = setTimeout(() => {
      // Lowest tabId wins (lexicographic); use earlier timestamp as tiebreaker
      let winnerId = null;
      for (const [id, ts] of candidates.entries()) {
        if (!winnerId) {
          winnerId = id;
        } else {
          const winnerTs = candidates.get(winnerId);
          if (ts < winnerTs || (ts === winnerTs && id < winnerId)) winnerId = id;
        }
      }
      leader = winnerId;
      if (leader === tabId) {
        channel.postMessage({ type: "leader", tabId });
      }
      for (const cb of leaderChangeListeners) {
        try { cb(leader === tabId); } catch(err) { console.error('[tab-leader] callback error:', err); }
      }
    }, 200);
  }

  channel.onmessage = (e) => {
    const msg = e.data;

    if (msg.type === "election") {
      candidates.set(msg.tabId, msg.timestamp);
    }

    if (msg.type === "leader") {
      leader = msg.tabId;
      for (const cb of leaderChangeListeners) {
        try { cb(leader === tabId); } catch(err) { console.error('[tab-leader] callback error:', err); }
      }
    }

    if (msg.type === "abdicate") {
      if (msg.tabId === leader) {
        startElection();
      }
    }

    // Leader receives writes from followers
    if (msg.type === "write" && leader === tabId) {
      // Forward to committedListeners — the main.js will feed this to gitClient
      for (const cb of committedListeners) {
        try { cb({ type: "follower-write", content: msg.content, fromTab: msg.tabId }); } catch(err) { console.error('[tab-leader] callback error:', err); }
      }
    }

    // Followers receive committed events from leader
    if (msg.type === "committed" && leader !== tabId) {
      for (const cb of committedListeners) {
        try { cb(msg); } catch(err) { console.error('[tab-leader] callback error:', err); }
      }
    }
  };

  function onBeforeUnload() {
    if (leader === tabId) {
      channel.postMessage({ type: "abdicate", tabId });
    }
  }
  addEventListener("beforeunload", onBeforeUnload);

  // Start first election
  startElection();

  return {
    isLeader() {
      return leader === tabId;
    },

    onLeaderChange(cb) {
      leaderChangeListeners.push(cb);
      return () => {
        const idx = leaderChangeListeners.indexOf(cb);
        if (idx >= 0) leaderChangeListeners.splice(idx, 1);
      };
    },

    relayWrite(content) {
      if (leader !== tabId) {
        channel.postMessage({ type: "write", content, tabId });
      }
    },

    broadcastCommitted(data) {
      if (leader === tabId) {
        channel.postMessage({ type: "committed", ...data });
      }
    },

    onCommitted(cb) {
      committedListeners.push(cb);
      return () => {
        const idx = committedListeners.indexOf(cb);
        if (idx >= 0) committedListeners.splice(idx, 1);
      };
    },

    destroy() {
      clearTimeout(electionTimeout);
      removeEventListener("beforeunload", onBeforeUnload);
      if (leader === tabId) {
        channel.postMessage({ type: "abdicate", tabId });
      }
      channel.close();
    },
  };
}
