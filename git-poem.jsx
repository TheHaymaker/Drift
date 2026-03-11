import { useState, useEffect, useRef, useCallback } from "react";

/*
  Atom-level poem renderer.
  Each word is a persistent node. When text morphs (stones→bones),
  individual characters animate: shared chars stay, old chars fade out,
  new chars fade in. Words slide to new positions. Lines breathe.
*/

// ─── Atom data (output from git-poem-parser) ───
// Inlined here so the artifact is self-contained.

const DATA = {
  commits: [
    { hash: "ae2a7d2", message: "initial draft — 2am, couldn't sleep", date: "2024-01-14" },
    { hash: "bff354d", message: "cut the 'I' — too direct", date: "2024-01-14" },
    { hash: "9f7dd02", message: "added new stanza, exploring repetition", date: "2024-01-15" },
    { hash: "4f8a9ce", message: "stones → bones. darker but truer", date: "2024-01-15" },
    { hash: "169475e", message: "restructured — the forgetting IS the poem", date: "2024-01-17" },
    { hash: "b4116f4", message: "removed 'someone' — let absence speak", date: "2024-01-19" },
    { hash: "y9z0a1b", message: "final — added closing line, full circle", date: "2024-01-22" },
  ],
  frames: [
    // Frame 0: initial draft
    [
      { id: "w0", text: "the", line: 0, offset: 0, type: "word", status: "born" },
      { id: "w1", text: "river", line: 0, offset: 4, type: "word", status: "born" },
      { id: "w2", text: "remembers", line: 0, offset: 10, type: "word", status: "born" },
      { id: "w3", text: "nothing", line: 0, offset: 20, type: "word", status: "born" },
      { id: "w4", text: "it", line: 1, offset: 0, type: "word", status: "born" },
      { id: "w5", text: "moves", line: 1, offset: 3, type: "word", status: "born" },
      { id: "w6", text: "and", line: 1, offset: 9, type: "word", status: "born" },
      { id: "w7", text: "that", line: 1, offset: 13, type: "word", status: "born" },
      { id: "w8", text: "is", line: 1, offset: 18, type: "word", status: "born" },
      { id: "w9", text: "all", line: 1, offset: 21, type: "word", status: "born" },
      { id: "w10", text: "I", line: 2, offset: 0, type: "word", status: "born" },
      { id: "w11", text: "stood", line: 2, offset: 2, type: "word", status: "born" },
      { id: "w12", text: "at", line: 2, offset: 8, type: "word", status: "born" },
      { id: "w13", text: "the", line: 2, offset: 11, type: "word", status: "born" },
      { id: "w14", text: "edge", line: 2, offset: 15, type: "word", status: "born" },
      { id: "w15", text: "once", line: 2, offset: 20, type: "word", status: "born" },
      { id: "w16", text: "watching", line: 3, offset: 0, type: "word", status: "born" },
      { id: "w17", text: "it", line: 3, offset: 9, type: "word", status: "born" },
      { id: "w18", text: "forget", line: 3, offset: 12, type: "word", status: "born" },
    ],
    // Frame 1: "I" → "someone"
    [
      { id: "w0", text: "the", line: 0, offset: 0, type: "word", status: "kept" },
      { id: "w1", text: "river", line: 0, offset: 4, type: "word", status: "kept" },
      { id: "w2", text: "remembers", line: 0, offset: 10, type: "word", status: "kept" },
      { id: "w3", text: "nothing", line: 0, offset: 20, type: "word", status: "kept" },
      { id: "w4", text: "it", line: 1, offset: 0, type: "word", status: "kept" },
      { id: "w5", text: "moves", line: 1, offset: 3, type: "word", status: "kept" },
      { id: "w6", text: "and", line: 1, offset: 9, type: "word", status: "kept" },
      { id: "w7", text: "that", line: 1, offset: 13, type: "word", status: "kept" },
      { id: "w8", text: "is", line: 1, offset: 18, type: "word", status: "kept" },
      { id: "w9", text: "all", line: 1, offset: 21, type: "word", status: "kept" },
      { id: "w10", text: "I", line: 2, offset: 0, type: "word", status: "died" },
      { id: "w20", text: "someone", line: 2, offset: 0, type: "word", status: "born" },
      { id: "w11", text: "stood", line: 2, offset: 8, type: "word", status: "kept" },
      { id: "w12", text: "at", line: 2, offset: 14, type: "word", status: "kept" },
      { id: "w13", text: "the", line: 2, offset: 17, type: "word", status: "kept" },
      { id: "w14", text: "edge", line: 2, offset: 21, type: "word", status: "kept" },
      { id: "w15", text: "once", line: 2, offset: 26, type: "word", status: "kept" },
      { id: "w16", text: "watching", line: 3, offset: 0, type: "word", status: "kept" },
      { id: "w17", text: "it", line: 3, offset: 9, type: "word", status: "kept" },
      { id: "w18", text: "forget", line: 3, offset: 12, type: "word", status: "kept" },
    ],
    // Frame 2: added stanza
    [
      { id: "w0", text: "the", line: 0, offset: 0, type: "word", status: "kept" },
      { id: "w1", text: "river", line: 0, offset: 4, type: "word", status: "kept" },
      { id: "w2", text: "remembers", line: 0, offset: 10, type: "word", status: "kept" },
      { id: "w3", text: "nothing", line: 0, offset: 20, type: "word", status: "kept" },
      { id: "w4", text: "it", line: 1, offset: 0, type: "word", status: "kept" },
      { id: "w5", text: "moves", line: 1, offset: 3, type: "word", status: "kept" },
      { id: "w6", text: "and", line: 1, offset: 9, type: "word", status: "kept" },
      { id: "w7", text: "that", line: 1, offset: 13, type: "word", status: "kept" },
      { id: "w8", text: "is", line: 1, offset: 18, type: "word", status: "kept" },
      { id: "w9", text: "all", line: 1, offset: 21, type: "word", status: "kept" },
      { id: "b0", text: "", line: 2, offset: 0, type: "blank", status: "born" },
      { id: "w20", text: "someone", line: 3, offset: 0, type: "word", status: "kept" },
      { id: "w11", text: "stood", line: 3, offset: 8, type: "word", status: "kept" },
      { id: "w12", text: "at", line: 3, offset: 14, type: "word", status: "kept" },
      { id: "w13", text: "the", line: 3, offset: 17, type: "word", status: "kept" },
      { id: "w14", text: "edge", line: 3, offset: 21, type: "word", status: "kept" },
      { id: "w15", text: "once", line: 3, offset: 26, type: "word", status: "kept" },
      { id: "w16", text: "watching", line: 4, offset: 0, type: "word", status: "kept" },
      { id: "w17", text: "it", line: 4, offset: 9, type: "word", status: "kept" },
      { id: "w18", text: "forget", line: 4, offset: 12, type: "word", status: "kept" },
      { id: "b1", text: "", line: 5, offset: 0, type: "blank", status: "born" },
      { id: "w30", text: "the", line: 6, offset: 0, type: "word", status: "born" },
      { id: "w31", text: "river", line: 6, offset: 4, type: "word", status: "born" },
      { id: "w32", text: "remembers", line: 6, offset: 10, type: "word", status: "born" },
      { id: "w33", text: "nothing", line: 6, offset: 20, type: "word", status: "born" },
      { id: "w34", text: "but", line: 7, offset: 0, type: "word", status: "born" },
      { id: "w35", text: "the", line: 7, offset: 4, type: "word", status: "born" },
      { id: "w36", text: "stones", line: 7, offset: 8, type: "word", status: "born" },
      { id: "w37", text: "do", line: 7, offset: 15, type: "word", status: "born" },
    ],
    // Frame 3: stones → bones (CHARACTER MORPH)
    [
      { id: "w0", text: "the", line: 0, offset: 0, type: "word", status: "kept" },
      { id: "w1", text: "river", line: 0, offset: 4, type: "word", status: "kept" },
      { id: "w2", text: "remembers", line: 0, offset: 10, type: "word", status: "kept" },
      { id: "w3", text: "nothing", line: 0, offset: 20, type: "word", status: "kept" },
      { id: "w4", text: "it", line: 1, offset: 0, type: "word", status: "kept" },
      { id: "w5", text: "moves", line: 1, offset: 3, type: "word", status: "kept" },
      { id: "w6", text: "and", line: 1, offset: 9, type: "word", status: "kept" },
      { id: "w7", text: "that", line: 1, offset: 13, type: "word", status: "kept" },
      { id: "w8", text: "is", line: 1, offset: 18, type: "word", status: "kept" },
      { id: "w9", text: "all", line: 1, offset: 21, type: "word", status: "kept" },
      { id: "b0", text: "", line: 2, offset: 0, type: "blank", status: "kept" },
      { id: "w20", text: "someone", line: 3, offset: 0, type: "word", status: "kept" },
      { id: "w11", text: "stood", line: 3, offset: 8, type: "word", status: "kept" },
      { id: "w12", text: "at", line: 3, offset: 14, type: "word", status: "kept" },
      { id: "w13", text: "the", line: 3, offset: 17, type: "word", status: "kept" },
      { id: "w14", text: "edge", line: 3, offset: 21, type: "word", status: "kept" },
      { id: "w15", text: "once", line: 3, offset: 26, type: "word", status: "kept" },
      { id: "w16", text: "watching", line: 4, offset: 0, type: "word", status: "kept" },
      { id: "w17", text: "it", line: 4, offset: 9, type: "word", status: "kept" },
      { id: "w18", text: "forget", line: 4, offset: 12, type: "word", status: "kept" },
      { id: "b1", text: "", line: 5, offset: 0, type: "blank", status: "kept" },
      { id: "w30", text: "the", line: 6, offset: 0, type: "word", status: "kept" },
      { id: "w31", text: "river", line: 6, offset: 4, type: "word", status: "kept" },
      { id: "w32", text: "remembers", line: 6, offset: 10, type: "word", status: "kept" },
      { id: "w33", text: "nothing", line: 6, offset: 20, type: "word", status: "kept" },
      { id: "w34", text: "but", line: 7, offset: 0, type: "word", status: "kept" },
      { id: "w35", text: "the", line: 7, offset: 4, type: "word", status: "kept" },
      { id: "w36", text: "bones", line: 7, offset: 8, type: "word", status: "morphed",
        morphFrom: "stones",
        charDiff: [
          { type: "delete", text: "st" },
          { type: "insert", text: "b" },
          { type: "keep", text: "ones" },
        ]
      },
      { id: "w37", text: "do", line: 7, offset: 14, type: "word", status: "kept" },
    ],
    // Frame 4: restructured
    [
      { id: "w0", text: "the", line: 0, offset: 0, type: "word", status: "kept" },
      { id: "w1", text: "river", line: 0, offset: 4, type: "word", status: "kept" },
      { id: "w2", text: "remembers", line: 0, offset: 10, type: "word", status: "kept" },
      { id: "w3", text: "nothing", line: 0, offset: 20, type: "word", status: "kept" },
      { id: "b2", text: "", line: 1, offset: 0, type: "blank", status: "born" },
      { id: "w4", text: "it", line: 2, offset: 0, type: "word", status: "kept" },
      { id: "w5", text: "moves", line: 2, offset: 3, type: "word", status: "kept" },
      { id: "w6", text: "and", line: 3, offset: 0, type: "word", status: "kept" },
      { id: "w7", text: "that", line: 3, offset: 4, type: "word", status: "kept" },
      { id: "w8", text: "is", line: 3, offset: 9, type: "word", status: "kept" },
      { id: "w9", text: "all", line: 3, offset: 12, type: "word", status: "kept" },
      { id: "b0", text: "", line: 4, offset: 0, type: "blank", status: "kept" },
      { id: "w20", text: "someone", line: 5, offset: 0, type: "word", status: "kept" },
      { id: "w11", text: "stood", line: 5, offset: 8, type: "word", status: "kept" },
      { id: "w12", text: "at", line: 5, offset: 14, type: "word", status: "kept" },
      { id: "w13", text: "the", line: 5, offset: 17, type: "word", status: "kept" },
      { id: "w14", text: "edge", line: 5, offset: 21, type: "word", status: "kept" },
      { id: "w15", text: "once", line: 5, offset: 26, type: "word", status: "died" },
      { id: "w16", text: "watching", line: 6, offset: 0, type: "word", status: "kept" },
      { id: "w17", text: "it", line: 6, offset: 9, type: "word", status: "kept" },
      { id: "w18", text: "forget", line: 6, offset: 12, type: "word", status: "kept" },
      { id: "b3", text: "", line: 7, offset: 0, type: "blank", status: "born" },
      { id: "w30", text: "the", line: 8, offset: 0, type: "word", status: "kept" },
      { id: "w31", text: "river", line: 8, offset: 4, type: "word", status: "kept" },
      { id: "w32", text: "remembers", line: 8, offset: 10, type: "word", status: "kept" },
      { id: "w33", text: "nothing", line: 8, offset: 20, type: "word", status: "died" },
      { id: "b4", text: "", line: 9, offset: 0, type: "blank", status: "born" },
      { id: "w40", text: "nothing", line: 10, offset: 0, type: "word", status: "born" },
      { id: "b5", text: "", line: 11, offset: 0, type: "blank", status: "born" },
      { id: "w34", text: "but", line: 12, offset: 0, type: "word", status: "kept" },
      { id: "w35", text: "the", line: 12, offset: 4, type: "word", status: "kept" },
      { id: "w36", text: "bones", line: 12, offset: 8, type: "word", status: "kept" },
      { id: "w37", text: "do", line: 12, offset: 14, type: "word", status: "kept" },
    ],
    // Frame 5: removed "someone stood"
    [
      { id: "w0", text: "the", line: 0, offset: 0, type: "word", status: "kept" },
      { id: "w1", text: "river", line: 0, offset: 4, type: "word", status: "kept" },
      { id: "w2", text: "remembers", line: 0, offset: 10, type: "word", status: "kept" },
      { id: "w3", text: "nothing", line: 0, offset: 20, type: "word", status: "kept" },
      { id: "b2", text: "", line: 1, offset: 0, type: "blank", status: "kept" },
      { id: "w4", text: "it", line: 2, offset: 0, type: "word", status: "kept" },
      { id: "w5", text: "moves", line: 2, offset: 3, type: "word", status: "kept" },
      { id: "w6", text: "and", line: 3, offset: 0, type: "word", status: "kept" },
      { id: "w7", text: "that", line: 3, offset: 4, type: "word", status: "kept" },
      { id: "w8", text: "is", line: 3, offset: 9, type: "word", status: "kept" },
      { id: "w9", text: "all", line: 3, offset: 12, type: "word", status: "kept" },
      { id: "b0", text: "", line: 4, offset: 0, type: "blank", status: "kept" },
      { id: "w20", text: "someone", line: 5, offset: 0, type: "word", status: "died" },
      { id: "w11", text: "stood", line: 5, offset: 0, type: "word", status: "died" },
      { id: "w12", text: "at", line: 5, offset: 0, type: "word", status: "kept" },
      { id: "w13", text: "the", line: 5, offset: 3, type: "word", status: "kept" },
      { id: "w14", text: "edge", line: 5, offset: 7, type: "word", status: "kept" },
      { id: "w16", text: "watching", line: 6, offset: 0, type: "word", status: "kept" },
      { id: "w17", text: "it", line: 6, offset: 9, type: "word", status: "kept" },
      { id: "w18", text: "forget", line: 6, offset: 12, type: "word", status: "kept" },
      { id: "b3", text: "", line: 7, offset: 0, type: "blank", status: "kept" },
      { id: "w30", text: "the", line: 8, offset: 0, type: "word", status: "kept" },
      { id: "w31", text: "river", line: 8, offset: 4, type: "word", status: "kept" },
      { id: "w32", text: "remembers", line: 8, offset: 10, type: "word", status: "kept" },
      { id: "b4", text: "", line: 9, offset: 0, type: "blank", status: "kept" },
      { id: "w40", text: "nothing", line: 10, offset: 0, type: "word", status: "kept" },
      { id: "b5", text: "", line: 11, offset: 0, type: "blank", status: "kept" },
      { id: "w34", text: "but", line: 12, offset: 0, type: "word", status: "kept" },
      { id: "w35", text: "the", line: 12, offset: 4, type: "word", status: "kept" },
      { id: "w36", text: "bones", line: 12, offset: 8, type: "word", status: "kept" },
      { id: "w37", text: "do", line: 12, offset: 14, type: "word", status: "kept" },
    ],
    // Frame 6: added closing line
    [
      { id: "w0", text: "the", line: 0, offset: 0, type: "word", status: "kept" },
      { id: "w1", text: "river", line: 0, offset: 4, type: "word", status: "kept" },
      { id: "w2", text: "remembers", line: 0, offset: 10, type: "word", status: "kept" },
      { id: "w3", text: "nothing", line: 0, offset: 20, type: "word", status: "kept" },
      { id: "b2", text: "", line: 1, offset: 0, type: "blank", status: "kept" },
      { id: "w4", text: "it", line: 2, offset: 0, type: "word", status: "kept" },
      { id: "w5", text: "moves", line: 2, offset: 3, type: "word", status: "kept" },
      { id: "w6", text: "and", line: 3, offset: 0, type: "word", status: "kept" },
      { id: "w7", text: "that", line: 3, offset: 4, type: "word", status: "kept" },
      { id: "w8", text: "is", line: 3, offset: 9, type: "word", status: "kept" },
      { id: "w9", text: "all", line: 3, offset: 12, type: "word", status: "kept" },
      { id: "b0", text: "", line: 4, offset: 0, type: "blank", status: "kept" },
      { id: "w12", text: "at", line: 5, offset: 0, type: "word", status: "kept" },
      { id: "w13", text: "the", line: 5, offset: 3, type: "word", status: "kept" },
      { id: "w14", text: "edge", line: 5, offset: 7, type: "word", status: "kept" },
      { id: "w16", text: "watching", line: 6, offset: 0, type: "word", status: "kept" },
      { id: "w17", text: "it", line: 6, offset: 9, type: "word", status: "kept" },
      { id: "w18", text: "forget", line: 6, offset: 12, type: "word", status: "kept" },
      { id: "b3", text: "", line: 7, offset: 0, type: "blank", status: "kept" },
      { id: "w30", text: "the", line: 8, offset: 0, type: "word", status: "kept" },
      { id: "w31", text: "river", line: 8, offset: 4, type: "word", status: "kept" },
      { id: "w32", text: "remembers", line: 8, offset: 10, type: "word", status: "kept" },
      { id: "b4", text: "", line: 9, offset: 0, type: "blank", status: "kept" },
      { id: "w40", text: "nothing", line: 10, offset: 0, type: "word", status: "kept" },
      { id: "b5", text: "", line: 11, offset: 0, type: "blank", status: "kept" },
      { id: "w34", text: "but", line: 12, offset: 0, type: "word", status: "kept" },
      { id: "w35", text: "the", line: 12, offset: 4, type: "word", status: "kept" },
      { id: "w36", text: "bones", line: 12, offset: 8, type: "word", status: "kept" },
      { id: "w37", text: "do", line: 12, offset: 14, type: "word", status: "kept" },
      { id: "b6", text: "", line: 13, offset: 0, type: "blank", status: "born" },
      { id: "w50", text: "the", line: 14, offset: 0, type: "word", status: "born" },
      { id: "w51", text: "river", line: 14, offset: 4, type: "word", status: "born" },
      { id: "w52", text: "moves", line: 14, offset: 10, type: "word", status: "born" },
      { id: "w53", text: "on", line: 14, offset: 16, type: "word", status: "born" },
    ],
  ],
};

// ─── Layout ───
const LINE_H = 42;
const CH_W = 11.5;
const PAD_LEFT = 32;
const PAD_TOP = 16;

function atomY(atom) {
  let y = PAD_TOP;
  for (let l = 0; l < atom.line; l++) y += LINE_H;
  return y;
}

function atomX(atom) {
  return PAD_LEFT + atom.offset * CH_W;
}

// ─── Animation ───
function lerp(a, b, t) { return a + (b - a) * t; }

function useAnim(dur = 1000) {
  const [t, setT] = useState(1);
  const raf = useRef(null);
  const t0 = useRef(0);
  const go = useCallback(() => {
    t0.current = performance.now();
    setT(0);
    const tick = (now) => {
      const p = Math.min((now - t0.current) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3.5);
      setT(e);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
  }, [dur]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return { t, go };
}

// ─── Char Diff Renderer ───
function CharMorph({ charDiff, t }) {
  return (
    <span style={{ position: "relative", display: "inline" }}>
      {charDiff.map((seg, i) => {
        if (seg.type === "keep") {
          return <span key={i} style={{ color: "#d4c5a9" }}>{seg.text}</span>;
        }
        if (seg.type === "delete") {
          return (
            <span key={i} style={{
              color: "#f87171",
              opacity: Math.max(0, 1 - t * 2.5),
              display: "inline-block",
              transform: `scaleX(${Math.max(0, 1 - t * 2)})`,
              transformOrigin: "right",
              width: t > 0.5 ? 0 : "auto",
              overflow: "hidden",
            }}>
              {seg.text}
            </span>
          );
        }
        if (seg.type === "insert") {
          return (
            <span key={i} style={{
              color: "#4ade80",
              opacity: Math.max(0, (t - 0.3) * 1.6),
              display: "inline-block",
              transform: `scaleX(${Math.min(1, Math.max(0, (t - 0.2) * 1.5))})`,
              transformOrigin: "left",
            }}>
              {seg.text}
            </span>
          );
        }
        return null;
      })}
    </span>
  );
}

// ─── Word Atom ───
function WordAtom({ atom, prevAtom, t }) {
  const currX = atomX(atom);
  const currY = atomY(atom);
  const prevX = prevAtom ? atomX(prevAtom) : currX;
  const prevY = prevAtom ? atomY(prevAtom) : currY;

  const x = lerp(prevX, currX, t);
  const y = lerp(prevY, currY, t);

  let opacity = 1;
  let color = "#d4c5a9";

  if (atom.status === "born") {
    opacity = Math.max(0, (t - 0.15) * 1.3);
    color = t < 0.9 ? "#4ade80" : "#d4c5a9";
  } else if (atom.status === "died") {
    opacity = Math.max(0, 1 - t * 1.8);
    color = "#f87171";
  } else if (atom.status === "morphed") {
    color = t < 0.85 ? "#fbbf24" : "#d4c5a9";
  }

  return (
    <div style={{
      position: "absolute",
      left: 0,
      top: 0,
      transform: `translate(${x}px, ${y}px)`,
      opacity,
      fontFamily: "'EB Garamond', Georgia, serif",
      fontSize: "1.45rem",
      lineHeight: `${LINE_H}px`,
      color,
      whiteSpace: "pre",
      letterSpacing: "0.01em",
      willChange: "transform, opacity",
    }}>
      {atom.status === "morphed" && atom.charDiff ? (
        <CharMorph charDiff={atom.charDiff} t={t} />
      ) : (
        atom.text
      )}
    </div>
  );
}

// ─── Main ───
export default function GitPoemAtoms() {
  const [ci, setCi] = useState(0);
  const [prevCi, setPrevCi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { t, go } = useAnim(1100);
  const prevRef = useRef(0);
  const ivRef = useRef(null);

  const nav = useCallback((n) => {
    setCi((p) => {
      const next = Math.max(0, Math.min(n, DATA.commits.length - 1));
      if (next !== p) { setPrevCi(p); return next; }
      return p;
    });
  }, []);

  useEffect(() => {
    if (ci !== prevRef.current) { go(); prevRef.current = ci; }
  }, [ci, go]);

  useEffect(() => {
    if (playing) {
      ivRef.current = setInterval(() => {
        setCi(p => {
          if (p >= DATA.commits.length - 1) { setPlaying(false); return p; }
          setPrevCi(p); return p + 1;
        });
      }, 3500);
    }
    return () => clearInterval(ivRef.current);
  }, [playing]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); nav(ci + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); nav(ci - 1); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [ci, nav]);

  const currFrame = DATA.frames[ci];
  const prevFrame = DATA.frames[prevCi];
  const prevLookup = {};
  for (const a of prevFrame) { prevLookup[a.id] = a; }

  const renderAtoms = currFrame.filter(a => a.type !== "blank");
  const maxLine = Math.max(0, ...currFrame.map(a => a.line));
  const containerH = PAD_TOP + (maxLine + 1) * LINE_H + 40;
  const commit = DATA.commits[ci];

  const btn = (active) => ({
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "0.64rem",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: "5px 13px",
    border: `1px solid ${active ? "#a08c6a" : "#3a3530"}`,
    borderRadius: "3px",
    background: active ? "rgba(160,140,106,0.12)" : "transparent",
    color: active ? "#c4b48a" : "#6a6050",
    cursor: "pointer",
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: "#1a1814",
      color: "#d4c5a9",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "44px 20px 80px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@300;400&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 25% 15%, rgba(160,140,106,0.04) 0%, transparent 50%)",
      }} />

      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "0.58rem",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: "#4a4030",
        marginBottom: "36px",
        zIndex: 1,
      }}>
        git log --word-diff-regex=. — atoms in revision
      </div>

      <div style={{
        width: "100%",
        maxWidth: "580px",
        position: "relative",
        height: `${containerH}px`,
        transition: "height 1s cubic-bezier(0.23,1,0.32,1)",
        zIndex: 1,
      }}>
        <div style={{
          position: "absolute", left: PAD_LEFT - 16, top: 0, bottom: 0, width: "1px",
          background: "linear-gradient(to bottom, transparent, #2a2520 10%, #2a2520 90%, transparent)",
        }} />

        {renderAtoms.map((atom) => (
          <WordAtom
            key={atom.id}
            atom={atom}
            prevAtom={prevLookup[atom.id]}
            t={t}
          />
        ))}
      </div>

      <div style={{
        width: "100%", maxWidth: "580px", marginTop: "16px",
        padding: "14px 24px", borderTop: "1px solid #2a2520", zIndex: 1,
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem",
          color: "#6a6050", display: "flex", gap: "12px", flexWrap: "wrap",
        }}>
          <span style={{ color: "#a08c6a" }}>{commit.hash}</span>
          <span style={{ color: "#4a4030", fontSize: "0.62rem" }}>{commit.date}</span>
          <span style={{ color: "#3a3530", fontSize: "0.6rem" }}>{ci + 1}/{DATA.commits.length}</span>
        </div>
        <div style={{
          marginTop: "4px", fontFamily: "'EB Garamond', serif",
          fontStyle: "italic", fontSize: "0.86rem", color: "#7a6a50",
        }}>
          "{commit.message}"
        </div>
      </div>

      <div style={{
        width: "100%", maxWidth: "580px", marginTop: "18px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", zIndex: 1,
      }}>
        <div style={{ display: "flex", gap: "3px" }}>
          {DATA.commits.map((_, i) => (
            <button key={i} onClick={() => nav(i)} style={{
              width: i === ci ? "24px" : "12px", height: "3px", borderRadius: "2px",
              border: "none", padding: 0, cursor: "pointer",
              background: i === ci ? "#a08c6a" : i < ci ? "#4a4030" : "#2a2520",
              transition: "all 0.4s ease",
            }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={btn(false)} onClick={() => nav(ci - 1)}>← prev</button>
          <button style={btn(playing)} onClick={() => {
            if (ci >= DATA.commits.length - 1) nav(0);
            setPlaying(p => !p);
          }}>{playing ? "pause" : "play"}</button>
          <button style={btn(false)} onClick={() => nav(ci + 1)}>next →</button>
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: "0.54rem", color: "#3a3530",
        }}>
          ← → or spacebar • watch the bones
        </div>
      </div>
    </div>
  );
}
