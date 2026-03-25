/**
 * Browser-compatible frame builder.
 * Ported from git-poem-parser.js — takes snapshot data and produces
 * atom-level frames for the playback animation.
 */

import { lcs } from './lcs.js';

function levenRatio(a, b) {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => {
    const row = Array(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return 1 - dp[m][n] / Math.max(m, n);
}

function charDiff(old, neu) {
  const oc = old.split(""), nc = neu.split("");
  const common = lcs(oc, nc);
  const ops = [];
  let oi = 0, ni = 0, ci = 0;
  while (ci < common.length) {
    const c = common[ci];
    while (oi < c.ai) { ops.push({ type: "delete", text: oc[oi] }); oi++; }
    while (ni < c.bi) { ops.push({ type: "insert", text: nc[ni] }); ni++; }
    ops.push({ type: "keep", text: c.v }); oi++; ni++; ci++;
  }
  while (oi < oc.length) { ops.push({ type: "delete", text: oc[oi] }); oi++; }
  while (ni < nc.length) { ops.push({ type: "insert", text: nc[ni] }); ni++; }
  const merged = [];
  for (const op of ops) {
    if (merged.length && merged[merged.length-1].type === op.type)
      merged[merged.length-1].text += op.text;
    else merged.push({ ...op });
  }
  return merged;
}

function wordDiff(oldLine, newLine) {
  const owWords = oldLine.split(/(\s+)/).filter(w => w.trim());
  const nwWords = newLine.split(/(\s+)/).filter(w => w.trim());
  const common = lcs(owWords, nwWords);

  const ops = [];
  let oi = 0, ni = 0, ci = 0;
  while (ci < common.length) {
    const c = common[ci];
    while (oi < c.ai) { ops.push({ type: "delete", text: owWords[oi] }); oi++; }
    while (ni < c.bi) { ops.push({ type: "insert", text: nwWords[ni] }); ni++; }
    ops.push({ type: "keep", text: c.v }); oi++; ni++; ci++;
  }
  while (oi < owWords.length) { ops.push({ type: "delete", text: owWords[oi] }); oi++; }
  while (ni < nwWords.length) { ops.push({ type: "insert", text: nwWords[ni] }); ni++; }

  const result = [];
  let idx = 0;
  while (idx < ops.length) {
    if (ops[idx].type === "delete" && idx + 1 < ops.length && ops[idx+1].type === "insert") {
      const ratio = levenRatio(ops[idx].text, ops[idx+1].text);
      if (ratio > 0.3) {
        result.push({
          type: "morph",
          from: ops[idx].text,
          to: ops[idx+1].text,
          charDiff: charDiff(ops[idx].text, ops[idx+1].text),
        });
        idx += 2;
        continue;
      }
    }
    result.push(ops[idx]);
    idx++;
  }
  return result;
}

/**
 * Build animation frames from an array of commit snapshots.
 * Each snapshot: { hash, message, date, lines: string[] }
 * Returns { commits, frames } matching the format expected by git-poem.jsx
 */
export function buildFrames(snapshots) {
  if (!snapshots || snapshots.length === 0) return { commits: [], frames: [] };

  function diffCommits(prevLines, currLines) {
    const common = lcs(prevLines, currLines);
    const ops = [];
    let oi = 0, ni = 0, ci = 0;
    while (ci < common.length) {
      const c = common[ci];
      while (oi < c.ai) { ops.push({ type: "delete", idx: oi, text: prevLines[oi] }); oi++; }
      while (ni < c.bi) { ops.push({ type: "insert", idx: ni, text: currLines[ni] }); ni++; }
      ops.push({ type: "keep", oldIdx: oi, newIdx: ni, text: c.v }); oi++; ni++; ci++;
    }
    while (oi < prevLines.length) { ops.push({ type: "delete", idx: oi, text: prevLines[oi] }); oi++; }
    while (ni < currLines.length) { ops.push({ type: "insert", idx: ni, text: currLines[ni] }); ni++; }

    const dels = ops.filter(o => o.type === "delete");
    const ins = ops.filter(o => o.type === "insert");
    const keeps = ops.filter(o => o.type === "keep");
    const usedD = new Set(), usedI = new Set();
    const paired = [];

    for (let d = 0; d < dels.length; d++) {
      if (dels[d].text.trim() === "") continue;
      let best = -1, bestScore = 0;
      for (let i = 0; i < ins.length; i++) {
        if (usedI.has(i) || ins[i].text.trim() === "") continue;
        const dw = new Set(dels[d].text.split(/\s+/));
        const iw = new Set(ins[i].text.split(/\s+/));
        let shared = 0;
        for (const w of dw) if (iw.has(w)) shared++;
        const score = shared / Math.max(dw.size, iw.size);
        const lr = levenRatio(dels[d].text, ins[i].text);
        const combined = Math.max(score, lr);
        if (combined > bestScore) { bestScore = combined; best = i; }
      }
      if (bestScore > 0.25 && best >= 0) {
        paired.push({ old: dels[d], new: ins[best] });
        usedD.add(d); usedI.add(best);
      }
    }

    return {
      keeps, paired,
      pureDels: dels.filter((_,i) => !usedD.has(i)),
      pureIns: ins.filter((_,i) => !usedI.has(i)),
    };
  }

  let idCounter = 0;
  const nid = () => `a${idCounter++}`;
  const frames = [];

  // Frame 0
  const f0 = [];
  for (let li = 0; li < snapshots[0].lines.length; li++) {
    const line = snapshots[0].lines[li];
    if (line.trim() === "") {
      f0.push({ id: nid(), text: "", line: li, offset: 0, type: "blank", status: "born" });
      continue;
    }
    const words = line.split(/(\s+)/).filter(Boolean);
    let offset = 0;
    for (const w of words) {
      if (w.trim() === "") { offset += w.length; continue; }
      f0.push({ id: nid(), text: w, line: li, offset, type: "word", status: "born" });
      offset += w.length + 1;
    }
  }
  frames.push(f0);

  // Subsequent frames
  for (let ci = 1; ci < snapshots.length; ci++) {
    const prev = snapshots[ci - 1];
    const curr = snapshots[ci];
    const diff = diffCommits(prev.lines, curr.lines);
    const frame = [];
    const prevFrame = frames[ci - 1];

    const prevByLine = {};
    for (const atom of prevFrame) {
      const key = atom.line;
      if (!prevByLine[key]) prevByLine[key] = [];
      prevByLine[key].push(atom);
    }

    for (const k of diff.keeps) {
      const oldAtoms = prevByLine[k.oldIdx] || [];
      for (const a of oldAtoms) {
        frame.push({ ...a, line: k.newIdx, status: "kept" });
      }
    }

    for (const p of diff.paired) {
      const wd = wordDiff(p.old.text, p.new.text);
      const oldAtoms = prevByLine[p.old.idx] || [];
      let offset = 0;

      for (const op of wd) {
        if (op.type === "keep") {
          const oldA = oldAtoms.find(a => a.text === op.text && a.type === "word");
          const id = oldA ? oldA.id : nid();
          frame.push({ id, text: op.text, line: p.new.idx, offset, type: "word", status: "kept" });
          offset += op.text.length + 1;
        } else if (op.type === "morph") {
          const oldA = oldAtoms.find(a => a.text === op.from && a.type === "word");
          const id = oldA ? oldA.id : nid();
          frame.push({
            id, text: op.to, line: p.new.idx, offset,
            type: "word", status: "morphed",
            morphFrom: op.from,
            charDiff: op.charDiff,
          });
          offset += op.to.length + 1;
        } else if (op.type === "insert") {
          frame.push({ id: nid(), text: op.text, line: p.new.idx, offset, type: "word", status: "born" });
          offset += op.text.length + 1;
        } else if (op.type === "delete") {
          const oldA = oldAtoms.find(a => a.text === op.text && a.type === "word");
          const id = oldA ? oldA.id : nid();
          frame.push({ id, text: op.text, line: p.new.idx, offset, type: "word", status: "died", diedAt: ci });
        }
      }
    }

    for (const ins of diff.pureIns) {
      if (ins.text.trim() === "") {
        frame.push({ id: nid(), text: "", line: ins.idx, offset: 0, type: "blank", status: "born" });
        continue;
      }
      const words = ins.text.split(/(\s+)/).filter(Boolean);
      let offset = 0;
      for (const w of words) {
        if (w.trim() === "") { offset += w.length; continue; }
        frame.push({ id: nid(), text: w, line: ins.idx, offset, type: "word", status: "born" });
        offset += w.length + 1;
      }
    }

    for (const del of diff.pureDels) {
      const oldAtoms = prevByLine[del.idx] || [];
      for (const a of oldAtoms) {
        if (a.type === "word") {
          frame.push({ ...a, status: "died", diedAt: ci });
        }
      }
    }

    frame.sort((a, b) => a.line - b.line || a.offset - b.offset);
    frames.push(frame);
  }

  return { commits: snapshots, frames };
}
