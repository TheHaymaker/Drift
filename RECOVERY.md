# Fly.io Volume Recovery Guide for Drift

Drift stores all data on a single Fly.io volume (`drift_data`) mounted at `/data`:
- **SQLite database:** `/data/drift.db` (users, documents, sessions)
- **Git repositories:** `/data/repos/<docId>/` (full document history)

If this volume is lost, **all data is gone** — and the app boots silently on an empty volume.

---

## Known Fly.io Volume Gotchas

| Gotcha | What Happens | Risk |
|--------|-------------|------|
| `fly deploy` (blue-green) | Replaces machine with new one → new empty volume | **HIGH** |
| Scaling changes | `fly scale count` or switching ephemeral→persistent creates new machines with new volumes | **HIGH** |
| Volumes are per-machine | Volumes follow machines, not apps. New machine = new volume | Core concept |
| Region changes | Volumes are region-locked. New region can't use old volume | Medium |
| Volume forking | New volumes may fork (snapshot) an existing one — point-in-time copy, not live | Medium |
| No deploy strategy set | Default blue-green replaces machines (and their volumes) | **HIGH** |

**Prevention:** `fly.toml` includes `[deploy] strategy = "immediate"` to force in-place updates.

---

## Step 1: Diagnose

```bash
# List all volumes — look for orphaned ones (empty "ATTACHED VM" column)
fly volumes list -a drift-6dgu9w

# List all machines — check creation dates and IDs
fly machines list -a drift-6dgu9w

# Check for automatic daily snapshots
fly volumes snapshots list <VOLUME_ID> -a drift-6dgu9w

# Check recent deployments for machine replacements
fly releases -a drift-6dgu9w

# SSH in and check current volume state
fly ssh console -a drift-6dgu9w -C "ls -la /data/ && ls /data/repos/ 2>/dev/null"

# Check health endpoint (includes document count)
curl https://drift-6dgu9w.fly.dev/api/health
```

**What to look for:**
- Orphaned volumes (not attached to any machine) — these may have your old data
- Volume creation dates — if the attached volume is newer than your data, it's a fresh volume
- Snapshots — Fly takes daily snapshots that can be restored

---

## Step 2: Recover from Orphaned Volume

If `fly volumes list` shows an unattached volume:

```bash
# 1. Create a temp machine attached to the orphaned volume to verify data
fly machines create . \
  --app drift-6dgu9w \
  --region iad \
  --volume <ORPHANED_VOLUME_ID>:/data \
  --vm-size shared-cpu-1x \
  --vm-memory 256

# 2. SSH into the temp machine and check data
fly ssh console -a drift-6dgu9w -s -C "ls /data/repos/ && sqlite3 /data/drift.db 'SELECT count(*) FROM documents;'"

# 3. If data is there, back it up
fly ssh console -a drift-6dgu9w -s -C "tar czf /tmp/drift-backup.tar.gz -C /data ."

# 4. Destroy the temp machine
fly machines destroy <TEMP_MACHINE_ID> -a drift-6dgu9w

# 5. Stop and destroy the current (empty-volume) machine
fly machines stop <CURRENT_MACHINE_ID> -a drift-6dgu9w
fly machines destroy <CURRENT_MACHINE_ID> -a drift-6dgu9w

# 6. Delete the empty volume
fly volumes delete <EMPTY_VOLUME_ID> -a drift-6dgu9w

# 7. Deploy — Fly will create a new machine attached to the remaining (old) volume
fly deploy --strategy immediate -a drift-6dgu9w
```

---

## Step 3: Recover from Snapshot

If no orphaned volume exists but snapshots are available:

```bash
# 1. List snapshots
fly volumes snapshots list <VOLUME_ID> -a drift-6dgu9w

# 2. Create a new volume from snapshot
fly volumes create drift_data \
  --region iad \
  --size 1 \
  --snapshot-id <SNAPSHOT_ID> \
  -a drift-6dgu9w

# 3. Stop current machine, destroy it and its empty volume
fly machines stop <MACHINE_ID> -a drift-6dgu9w
fly machines destroy <MACHINE_ID> -a drift-6dgu9w
fly volumes delete <EMPTY_VOLUME_ID> -a drift-6dgu9w

# 4. Deploy — will pick up the restored volume
fly deploy --strategy immediate -a drift-6dgu9w
```

---

## Step 4: Browser-Side Recovery (Last Resort)

Drift uses isomorphic-git with LightningFS (IndexedDB) in the browser. If users have visited their documents recently, their browser may still have a copy of the git repo.

Users can check by:
1. Opening the app in the same browser they used before
2. Opening browser DevTools → Application → IndexedDB
3. Looking for LightningFS databases containing repo data

If browser-side repos exist, users can re-sync to the server by opening their documents (the sync protocol will push commits from browser to server).

---

## Prevention Checklist

- [x] `fly.toml` has `[deploy] strategy = "immediate"` (prevents machine replacement)
- [ ] Set up external backup cron (see below)
- [ ] Monitor `/api/health` endpoint for `documents: 0` alerts

### External Backup (Recommended)

Run periodically from a local machine or CI:

```bash
#!/bin/bash
# backup-drift.sh
DATE=$(date +%Y%m%d-%H%M%S)
fly ssh console -a drift-6dgu9w -C "sqlite3 /data/drift.db '.backup /tmp/drift-backup.db'"
fly ssh console -a drift-6dgu9w -C "tar czf /tmp/drift-backup.tar.gz -C /data drift.db repos/"
# Download via fly proxy or sftp
mkdir -p ./backups
fly sftp get /tmp/drift-backup.tar.gz ./backups/drift-${DATE}.tar.gz -a drift-6dgu9w
echo "Backup saved to ./backups/drift-${DATE}.tar.gz"
```
