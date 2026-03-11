# drift — Architecture: Browser-Side Git

## Overview

Drift is a writing instrument that auto-commits to git when the writer pauses typing. This document describes the architecture for moving git operations from the server to the browser using isomorphic-git.

## Current Architecture (server-side git)

```
Editor keystroke → WebSocket "update" → Server Session → fs.writeFile → git CLI commit → broadcast
```

- Every keystroke crosses the network
- Server runs `git add` + `git commit` via `execFile("git", ...)`
- No offline capability
- Server does heavy per-keystroke I/O

### Current Components

| Component | File | Role |
|---|---|---|
| Express + WebSocket server | `server.js` | Routes messages, serves API |
| Session manager | `lib/Session.js` | Pause detection, commit message generation, git queue |
| Git operations | `lib/GitOps.js` | `execFile("git", ...)` wrapper |
| Document metadata | `lib/DocumentStore.js` | SQLite (better-sqlite3) |
| Frontend SPA | `public/index.html` | Vanilla JS, no bundler |
| Poem visualizer | `git-poem-parser.js` | Atom-level diff analysis |
| React visualizer | `git-poem.jsx` | Animated poem component |

## Target Architecture (browser-side git)

```
Editor keystroke → Web Worker → isomorphic-git + LightningFS → IndexedDB (instant, local)
                              → sync to server periodically via HTTP
```

### What Moves to the Browser

| Component | Server → Browser |
|---|---|
| Pause timer | `Session.js:61-81` → Web Worker |
| Commit message generation | `Session.js:116-169` → Web Worker |
| `git init/add/commit` | `GitOps.js` via CLI → Web Worker via isomorphic-git |
| `git log/show` | `GitOps.js` via CLI → Browser via isomorphic-git |
| File content storage | Server filesystem → LightningFS (IndexedDB) |

### What Stays on the Server

| Component | Why |
|---|---|
| DocumentStore (SQLite) | Document registry, ownership, metadata |
| Canonical git repos | Durability, reader/playback view |
| REST API for readers | Public playback doesn't have the repo locally |
| Sync endpoints | Receives pushes from browser |

### New Browser Components

```
src/
├── main.js              # Extracted from index.html inline script
├── style.css            # Extracted from index.html inline styles
├── git-client.js        # Promise-based Worker wrapper
├── sync.js              # Sync orchestrator (push/pull/clone)
├── tab-leader.js        # Multi-tab leader election via BroadcastChannel
└── worker/
    └── git-worker.js    # Web Worker: isomorphic-git + LightningFS + pause timer
```

### Sync Protocol

Custom REST endpoints (not git smart HTTP protocol):

- `GET /api/documents/:docId/sync/clone` — full history as ordered commit array
- `GET /api/documents/:docId/sync/pull?since=<hash>` — incremental commits
- `POST /api/documents/:docId/sync/push` — browser pushes commits to server (idempotent)

### Key Design Decisions

1. **Vite as build system** — isomorphic-git needs a bundler for browser usage. Vite is minimal and handles Worker bundling natively.

2. **Custom sync over smart HTTP** — Avoids complexity of git-http-backend. Repos are tiny (single text files), so commit-by-commit sync is efficient.

3. **Leader election for multi-tab** — Only one tab writes to IndexedDB at a time via BroadcastChannel coordination.

4. **Dual-write migration** — Server and browser both commit during transition. Browser takes over incrementally.

## Technology Stack

| Layer | Technology |
|---|---|
| Browser git | isomorphic-git |
| Browser filesystem | LightningFS (@nicolo-ribaudo/lightning-fs) backed by IndexedDB |
| Worker communication | Web Worker + postMessage |
| Multi-tab coordination | BroadcastChannel API |
| Build system | Vite |
| Server | Express + better-sqlite3 (unchanged) |
| Deployment | Fly.io with persistent volume (unchanged) |
