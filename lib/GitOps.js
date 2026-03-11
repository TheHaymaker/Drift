/**
 * GitOps — async git operations for drift
 *
 * Every function takes repoPath as first arg to support multi-document.
 * Uses execFile (not exec) to avoid shell injection.
 */

const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "drift",
  GIT_AUTHOR_EMAIL: "drift@poem",
  GIT_COMMITTER_NAME: "drift",
  GIT_COMMITTER_EMAIL: "drift@poem",
};

function git(repoPath, args, env) {
  return new Promise((resolve, reject) => {
    execFile("git", args, {
      cwd: repoPath,
      encoding: "utf-8",
      env: env || GIT_ENV,
    }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        reject(err);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function ensureRepo(repoPath, filename) {
  await fs.mkdir(repoPath, { recursive: true });

  const gitDir = path.join(repoPath, ".git");
  try {
    await fs.access(gitDir);
  } catch {
    await git(repoPath, ["init"]);
  }

  const filePath = path.join(repoPath, filename);
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "");
    await git(repoPath, ["add", filename]);
    await git(repoPath, ["commit", "-m", "begin", "--allow-empty-message"]);
  }
}

async function readFile(repoPath, filename) {
  try {
    return await fs.readFile(path.join(repoPath, filename), "utf-8");
  } catch {
    return "";
  }
}

async function writeFile(repoPath, filename, content) {
  await fs.writeFile(path.join(repoPath, filename), content);
}

async function commitFile(repoPath, filename, message) {
  try {
    await git(repoPath, ["add", filename]);
    try {
      await git(repoPath, ["diff", "--cached", "--quiet"]);
      return null; // no changes
    } catch {
      // diff found changes — proceed to commit
    }
    await git(repoPath, ["commit", "-m", message]);
    const hash = await git(repoPath, ["rev-parse", "--short", "HEAD"]);
    const countStr = await git(repoPath, ["rev-list", "--count", "HEAD"]);
    const count = parseInt(countStr, 10);
    return { hash, message, count };
  } catch (e) {
    console.error(`  commit failed (${repoPath}):`, e.message);
    return null;
  }
}

async function getLog(repoPath, filename, max = 200) {
  try {
    const raw = await git(repoPath, [
      "log", "--reverse", `--format=%H|%ai|%s`, "--", filename,
    ]);
    return raw.split("\n").filter(Boolean).map((line, i) => {
      const [hash, date, ...msg] = line.split("|");
      return { hash: hash.slice(0, 7), date, message: msg.join("|"), index: i };
    });
  } catch {
    return [];
  }
}

async function getFileAt(repoPath, hash, filename) {
  try {
    return await git(repoPath, ["show", `${hash}:${filename}`]);
  } catch {
    return "";
  }
}

async function getWordDiff(repoPath, hashA, hashB, filename) {
  try {
    return await git(repoPath, [
      "diff", "--word-diff-regex=.", hashA, hashB, "--", filename,
    ]);
  } catch {
    return "";
  }
}

async function getStructuredDiff(repoPath, hashA, hashB, filename) {
  try {
    const raw = await git(repoPath, [
      "diff", "--word-diff", hashA, hashB, "--", filename,
    ]);
    return parseWordDiff(raw);
  } catch {
    return [];
  }
}

function parseWordDiff(raw) {
  // Parse git --word-diff output into structured segments
  // Format: unchanged text, {+added+}, [-removed-]
  const segments = [];
  // Strip the diff header (everything up to and including @@...@@)
  const bodyMatch = raw.match(/@@[^@]*@@\n?([\s\S]*)/);
  if (!bodyMatch) return segments;
  const body = bodyMatch[1];

  const regex = /\{\+([^]*?)\+\}|\[-([^]*?)-\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(body)) !== null) {
    // Unchanged text before this match
    if (match.index > lastIndex) {
      const text = body.slice(lastIndex, match.index);
      if (text) segments.push({ type: "kept", text });
    }
    if (match[1] !== undefined) {
      segments.push({ type: "added", text: match[1] });
    } else if (match[2] !== undefined) {
      segments.push({ type: "removed", text: match[2] });
    }
    lastIndex = regex.lastIndex;
  }

  // Trailing unchanged text
  if (lastIndex < body.length) {
    const text = body.slice(lastIndex);
    if (text) segments.push({ type: "kept", text });
  }

  return segments;
}

module.exports = {
  ensureRepo,
  readFile,
  writeFile,
  commitFile,
  getLog,
  getFileAt,
  getWordDiff,
  getStructuredDiff,
};
