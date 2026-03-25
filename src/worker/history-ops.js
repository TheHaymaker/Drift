/**
 * Destructive history rewrite operations for browser-side git.
 * Each operation wipes and rebuilds the LightningFS filesystem.
 */

import git from "isomorphic-git";
import LightningFS from "@isomorphic-git/lightning-fs";

const author = { name: "drift", email: "drift@poem" };

async function getLogInternal(lfs, dir, docId, oidCache) {
  try {
    const commits = await git.log({ fs: lfs, dir });
    const result = commits
      .reverse()
      .map((c, i) => ({
        hash: c.oid.slice(0, 7),
        date: new Date(c.commit.author.timestamp * 1000).toISOString(),
        message: c.commit.message.trim(),
        index: i,
      }));

    // Populate OID cache
    if (docId && oidCache) {
      if (!oidCache.has(docId)) oidCache.set(docId, new Map());
      const cache = oidCache.get(docId);
      for (const c of commits) {
        cache.set(c.oid.slice(0, 7), c.oid);
      }
    }

    return result;
  } catch (err) {
    console.error('[history-ops] getLogInternal failed:', err.message, err.stack);
    return [];
  }
}

export async function squashCommits({ doc, docId, filename, fromIndex, toIndex, message, oidCache }) {
  console.log('[history-ops] starting squash for docId:', docId);
  const { fs: lfs, dir } = doc;

  // 1. Read full log and content at each commit
  const commits = await git.log({ fs: lfs, dir });
  const chronological = [...commits].reverse();
  const snapshots = [];
  for (const c of chronological) {
    let content = "";
    try {
      const { blob } = await git.readBlob({
        fs: lfs, dir, oid: c.oid, filepath: filename,
      });
      content = new TextDecoder().decode(blob);
    } catch (err) {
      console.error('[history-ops] squash failed reading blob:', err.message, err.stack);
    }
    snapshots.push({
      message: c.commit.message.trim(),
      date: c.commit.author.timestamp,
      content,
    });
  }

  // 2. Build new commit plan: collapse fromIndex..toIndex into one
  const newPlan = [];
  for (let i = 0; i < snapshots.length; i++) {
    if (i === fromIndex) {
      // Squashed commit: use content from toIndex, combine messages
      const msgs = [];
      for (let j = fromIndex; j <= toIndex; j++) {
        msgs.push(snapshots[j].message);
      }
      const squashMsg = message || ("squash #" + (fromIndex + 1) + "\u2013#" + (toIndex + 1) + ": " + msgs.join("; "));
      newPlan.push({
        message: squashMsg,
        date: snapshots[toIndex].date,
        content: snapshots[toIndex].content,
      });
    } else if (i > fromIndex && i <= toIndex) {
      // Skip — these are squashed into fromIndex
      continue;
    } else {
      newPlan.push(snapshots[i]);
    }
  }

  // 3. Wipe and rebuild the repo
  const fsName = `drift-${docId}`;
  let newFs;
  try {
    newFs = new LightningFS(fsName, { wipe: true });
    doc.fs = newFs;

    try { await newFs.promises.mkdir(dir, { recursive: true }); } catch {}
    await git.init({ fs: newFs, dir, defaultBranch: "main" });

    for (const c of newPlan) {
      await newFs.promises.writeFile(`${dir}/${filename}`, c.content);
      await git.add({ fs: newFs, dir, filepath: filename });
      await git.commit({
        fs: newFs, dir,
        message: c.message,
        author: { ...author, timestamp: c.date },
      });
    }
  } catch (err) {
    console.error('[history-ops] squash failed — filesystem may be in inconsistent state:', err);
    throw err;
  }

  doc.lastContent = newPlan[newPlan.length - 1].content;
  const log = await getLogInternal(newFs, dir, docId, oidCache);

  console.log('[history-ops] squash complete');
  return {
    log,
    content: doc.lastContent,
  };
}

export async function deleteCommits({ doc, docId, filename, indices, oidCache }) {
  console.log('[history-ops] starting deleteCommits for docId:', docId);
  const { fs: lfs, dir } = doc;

  const indexSet = new Set(indices);

  // 1. Read full log and content at each commit
  const commits = await git.log({ fs: lfs, dir });
  const chronological = [...commits].reverse();
  const snapshots = [];
  for (const c of chronological) {
    let content = "";
    try {
      const { blob } = await git.readBlob({
        fs: lfs, dir, oid: c.oid, filepath: filename,
      });
      content = new TextDecoder().decode(blob);
    } catch (err) {
      console.error('[history-ops] deleteCommits failed reading blob:', err.message, err.stack);
    }
    snapshots.push({
      message: c.commit.message.trim(),
      date: c.commit.author.timestamp,
      content,
    });
  }

  // 2. Filter out deleted commits
  const newPlan = snapshots.filter((_, i) => !indexSet.has(i));
  if (newPlan.length === 0) throw new Error("cannot delete all commits");

  // 3. Wipe and rebuild the repo
  const fsName = `drift-${docId}`;
  let newFs;
  try {
    newFs = new LightningFS(fsName, { wipe: true });
    doc.fs = newFs;

    try { await newFs.promises.mkdir(dir, { recursive: true }); } catch {}
    await git.init({ fs: newFs, dir, defaultBranch: "main" });

    for (const c of newPlan) {
      await newFs.promises.writeFile(`${dir}/${filename}`, c.content);
      await git.add({ fs: newFs, dir, filepath: filename });
      await git.commit({
        fs: newFs, dir,
        message: c.message,
        author: { ...author, timestamp: c.date },
      });
    }
  } catch (err) {
    console.error('[history-ops] deleteCommits failed — filesystem may be in inconsistent state:', err);
    throw err;
  }

  doc.lastContent = newPlan[newPlan.length - 1].content;
  const log = await getLogInternal(newFs, dir, docId, oidCache);

  console.log('[history-ops] deleteCommits complete');
  return {
    log,
    content: doc.lastContent,
  };
}

export async function reorderCommits({ doc, docId, filename, newOrder, oidCache }) {
  console.log('[history-ops] starting reorderCommits for docId:', docId);
  const { fs: lfs, dir } = doc;

  // 1. Read all commits and their content, indexed by short hash
  const commits = await git.log({ fs: lfs, dir });
  const byHash = {};
  for (const c of commits) {
    const shortHash = c.oid.slice(0, 7);
    let content = "";
    try {
      const { blob } = await git.readBlob({
        fs: lfs, dir, oid: c.oid, filepath: filename,
      });
      content = new TextDecoder().decode(blob);
    } catch (err) {
      console.error('[history-ops] reorderCommits failed reading blob:', err.message, err.stack);
    }
    byHash[shortHash] = {
      message: c.commit.message.trim(),
      date: c.commit.author.timestamp,
      content,
    };
  }

  // 2. Build new commit plan in the requested order
  const newPlan = newOrder.map(hash => byHash[hash]).filter(Boolean);
  if (newPlan.length === 0) throw new Error("reorder: no valid commits");

  // 3. Wipe and rebuild
  const fsName = `drift-${docId}`;
  let newFs;
  try {
    newFs = new LightningFS(fsName, { wipe: true });
    doc.fs = newFs;

    try { await newFs.promises.mkdir(dir, { recursive: true }); } catch {}
    await git.init({ fs: newFs, dir, defaultBranch: "main" });

    for (const c of newPlan) {
      await newFs.promises.writeFile(`${dir}/${filename}`, c.content);
      await git.add({ fs: newFs, dir, filepath: filename });
      await git.commit({
        fs: newFs, dir,
        message: c.message,
        author: { ...author, timestamp: c.date },
      });
    }
  } catch (err) {
    console.error('[history-ops] reorderCommits failed — filesystem may be in inconsistent state:', err);
    throw err;
  }

  doc.lastContent = newPlan[newPlan.length - 1].content;
  const log = await getLogInternal(newFs, dir, docId, oidCache);

  console.log('[history-ops] reorderCommits complete');
  return {
    log,
    content: doc.lastContent,
  };
}
