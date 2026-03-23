import { useState, useEffect, useRef, useCallback } from "react";
import { createHighlighter } from "shiki";
import { ShikiMagicMove } from "shiki-magic-move/react";
import "shiki-magic-move/style.css";
import { buildFrames } from "./build-frames.js";
import { generateDisintegrationMask } from "./disintegration-mask.js";

// ─── Layout constants ───
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

function lerp(a, b, t) { return a + (b - a) * t; }

function useAnim(dur = 1100) {
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

// ─── Char Morph ───
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

// ─── Atoms Renderer ───
function AtomsRenderer({ frames, currentIndex, prevIndex, t }) {
  const currFrame = frames[currentIndex];
  const prevFrame = frames[prevIndex];
  const prevLookup = {};
  for (const a of prevFrame) { prevLookup[a.id] = a; }

  const renderAtoms = currFrame.filter(a => a.type !== "blank");
  const maxLine = Math.max(0, ...currFrame.map(a => a.line));
  const containerH = PAD_TOP + (maxLine + 1) * LINE_H + 40;

  return (
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
  );
}

// ─── Magic Move Renderer ───
function MagicMoveRenderer({ commits, currentIndex }) {
  const [highlighter, setHighlighter] = useState(null);
  const [maskUrl, setMaskUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    createHighlighter({
      themes: ["vitesse-dark"],
      langs: ["text"],
    }).then((hl) => {
      if (!cancelled) setHighlighter(hl);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setMaskUrl(generateDisintegrationMask());
  }, []);

  if (!highlighter) {
    return (
      <div style={{
        width: "100%",
        maxWidth: "580px",
        minHeight: "200px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "0.68rem",
        color: "#4a4030",
      }}>
        loading highlighter&hellip;
      </div>
    );
  }

  const code = commits[currentIndex].lines.join("\n");

  return (
    <div className="magic-move-wrapper" style={{
      width: "100%",
      maxWidth: "580px",
      position: "relative",
      zIndex: 1,
    }}>
      <style>{`
        .magic-move-wrapper .shiki-magic-move-container {
          background: transparent !important;
          padding: 16px 32px;
        }
        .magic-move-wrapper pre,
        .magic-move-wrapper code {
          font-family: 'EB Garamond', Georgia, serif !important;
          font-size: 1.45rem !important;
          line-height: 42px !important;
          letter-spacing: 0.01em !important;
          background: transparent !important;
        }
        .magic-move-wrapper .shiki-magic-move-container span {
          color: #d4c5a9 !important;
        }

        /* ── Disintegration mask for enter/leave ── */
        .magic-move-wrapper .shiki-magic-move-enter-active,
        .magic-move-wrapper .shiki-magic-move-leave-active {
          mask-image: url('${maskUrl || ""}');
          -webkit-mask-image: url('${maskUrl || ""}');
          mask-size: 6400% 100%;
          -webkit-mask-size: 6400% 100%;
          mask-repeat: no-repeat;
          -webkit-mask-repeat: no-repeat;
        }

        /* Entering tokens: materialize from dust (frame 63 → frame 0) */
        .magic-move-wrapper .shiki-magic-move-enter-from {
          mask-position: 100% 0;
          -webkit-mask-position: 100% 0;
        }
        .magic-move-wrapper .shiki-magic-move-enter-active {
          color: #4ade80 !important;
          transition: mask-position var(--smm-duration, .8s) steps(63),
                      -webkit-mask-position var(--smm-duration, .8s) steps(63),
                      color var(--smm-duration, .8s) ease !important;
          mask-position: 0% 0;
          -webkit-mask-position: 0% 0;
        }

        /* Leaving tokens: disintegrate into dust (frame 0 → frame 63) */
        .magic-move-wrapper .shiki-magic-move-leave-active {
          color: #f87171 !important;
          transition: mask-position var(--smm-duration, .8s) steps(63),
                      -webkit-mask-position var(--smm-duration, .8s) steps(63),
                      color var(--smm-duration, .8s) ease !important;
          mask-position: 0% 0;
          -webkit-mask-position: 0% 0;
        }
        .magic-move-wrapper .shiki-magic-move-leave-to {
          mask-position: 100% 0;
          -webkit-mask-position: 100% 0;
        }
      `}</style>
      <ShikiMagicMove
        highlighter={highlighter}
        code={code}
        lang="text"
        theme="vitesse-dark"
        options={{
          duration: 800,
          stagger: 0.03,
          lineNumbers: false,
        }}
      />
    </div>
  );
}

// ─── Nav ───
function CommitNav({ commits, currentIndex, onNavigate, playing, onTogglePlay, mode, onToggleMode }) {
  const ci = currentIndex;

  const nav = useCallback(
    (n) => {
      const next = Math.max(0, Math.min(n, commits.length - 1));
      onNavigate(next);
    },
    [commits.length, onNavigate]
  );

  useEffect(() => {
    const h = (e) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        nav(ci + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nav(ci - 1);
      } else if (e.key === "m") {
        e.preventDefault();
        onToggleMode?.();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [ci, nav, onToggleMode]);

  const commit = commits[ci];

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
    <>
      <div style={{
        width: "100%",
        maxWidth: "580px",
        marginTop: "16px",
        padding: "14px 24px",
        borderTop: "1px solid #2a2520",
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.68rem",
          color: "#6a6050",
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
        }}>
          <span style={{ color: "#a08c6a" }}>{commit.hash}</span>
          <span style={{ color: "#4a4030", fontSize: "0.62rem" }}>{commit.date}</span>
          <span style={{ color: "#3a3530", fontSize: "0.6rem" }}>{ci + 1}/{commits.length}</span>
        </div>
        <div style={{
          marginTop: "4px",
          fontFamily: "'EB Garamond', serif",
          fontStyle: "italic",
          fontSize: "0.86rem",
          color: "#7a6a50",
        }}>
          &ldquo;{commit.message}&rdquo;
        </div>
      </div>

      <div style={{
        width: "100%",
        maxWidth: "580px",
        marginTop: "18px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
        zIndex: 1,
      }}>
        <div style={{ display: "flex", gap: "3px" }}>
          {commits.map((_, i) => (
            <button
              key={i}
              onClick={() => nav(i)}
              style={{
                width: i === ci ? "24px" : "12px",
                height: "3px",
                borderRadius: "2px",
                border: "none",
                padding: 0,
                cursor: "pointer",
                background: i === ci ? "#a08c6a" : i < ci ? "#4a4030" : "#2a2520",
                transition: "all 0.4s ease",
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={btn(false)} onClick={() => nav(ci - 1)}>
            &larr; prev
          </button>
          <button
            style={btn(playing)}
            onClick={() => {
              if (ci >= commits.length - 1) nav(0);
              onTogglePlay();
            }}
          >
            {playing ? "pause" : "play"}
          </button>
          <button style={btn(false)} onClick={() => nav(ci + 1)}>
            next &rarr;
          </button>
        </div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.54rem",
            color: "#3a3530",
          }}>
            &larr; &rarr; or spacebar &bull; press m to switch mode
          </div>
          {onToggleMode && (
            <button style={btn(false)} onClick={onToggleMode}>
              {mode === "atoms" ? "magic-move" : "atoms"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main Playback Component ───
export default function Playback({ docId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [ci, setCi] = useState(0);
  const [prevCi, setPrevCi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState("magic-move");
  const { t, go } = useAnim(1100);
  const prevRef = useRef(0);
  const ivRef = useRef(null);

  useEffect(() => {
    fetch(`/api/documents/${docId}/playback`)
      .then(r => {
        if (!r.ok) throw new Error("failed to load");
        return r.json();
      })
      .then(d => {
        if (!d.commits || d.commits.length === 0) {
          setError("no commits yet — write something first");
          return;
        }
        const framed = buildFrames(d.commits);
        setData(framed);
      })
      .catch(() => setError("failed to load playback data"));
  }, [docId]);

  const handleNavigate = useCallback((n) => {
    if (!data) return;
    setCi((p) => {
      const next = Math.max(0, Math.min(n, data.commits.length - 1));
      if (next !== p) { setPrevCi(p); return next; }
      return p;
    });
  }, [data]);

  useEffect(() => {
    if (ci !== prevRef.current) { go(); prevRef.current = ci; }
  }, [ci, go]);

  useEffect(() => {
    if (!data) return;
    if (playing) {
      ivRef.current = setInterval(() => {
        setCi(p => {
          if (p >= data.commits.length - 1) { setPlaying(false); return p; }
          setPrevCi(p); return p + 1;
        });
      }, 3500);
    }
    return () => clearInterval(ivRef.current);
  }, [playing, data]);

  if (error) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#141210",
        color: "#d4c5a9",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "24px",
        fontFamily: "'EB Garamond', Georgia, serif",
      }}>
        <div style={{ color: "#7a7060", fontStyle: "italic", fontSize: "1.1rem" }}>{error}</div>
        <button onClick={onBack} style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.62rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "8px 20px",
          border: "1px solid #2a2520",
          borderRadius: "3px",
          background: "transparent",
          color: "#6a6050",
          cursor: "pointer",
        }}>
          &larr; back
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#141210",
        color: "#4a4030",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "0.68rem",
      }}>
        loading playback&hellip;
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#141210",
      color: "#d4c5a9",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "44px 20px 80px",
    }}>
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 25% 15%, rgba(160,140,106,0.04) 0%, transparent 50%)",
      }} />

      <div style={{
        width: "100%",
        maxWidth: "580px",
        display: "flex",
        alignItems: "baseline",
        gap: "16px",
        marginBottom: "36px",
        zIndex: 1,
      }}>
        <button onClick={onBack} style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.58rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#4a4030",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}>
          drift
        </button>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.58rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#4a4030",
        }}>
          {mode === "magic-move"
            ? "git log \u2014 shiki magic move"
            : "git log --word-diff-regex=. \u2014 atoms in revision"}
        </span>
      </div>

      {mode === "atoms" ? (
        <AtomsRenderer
          frames={data.frames}
          currentIndex={ci}
          prevIndex={prevCi}
          t={t}
        />
      ) : (
        <MagicMoveRenderer
          commits={data.commits}
          currentIndex={ci}
        />
      )}

      <CommitNav
        commits={data.commits}
        currentIndex={ci}
        onNavigate={handleNavigate}
        playing={playing}
        onTogglePlay={() => {
          if (ci >= data.commits.length - 1) handleNavigate(0);
          setPlaying(p => !p);
        }}
        mode={mode}
        onToggleMode={() => setMode(m => m === "atoms" ? "magic-move" : "atoms")}
      />
    </div>
  );
}
