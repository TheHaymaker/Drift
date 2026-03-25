import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ShikiMagicMovePrecompiled } from "shiki-magic-move/react";
import "shiki-magic-move/style.css";
import { generateDisintegrationMask } from "./disintegration-mask.js";
import { htmlToKeyedTokens } from "./htmlTokenizer.js";

// ─── Timing defaults (ms) ───
const BASE_INTERVAL = 3500;
const BASE_SMM_DURATION = 800;
const SPEED_STEPS = [0.5, 1, 1.5, 2, 3];

// ─── Magic Move Renderer ───
function MagicMoveRenderer({ commits, currentIndex, animDuration = BASE_SMM_DURATION }) {
  const [maskUrl, setMaskUrl] = useState(null);

  useEffect(() => {
    setMaskUrl(generateDisintegrationMask());
  }, []);

  // Pre-compute keyed token steps from HTML (or plain text fallback)
  const steps = useMemo(
    () => commits.map((c) => htmlToKeyedTokens(c.html || c.lines.join("\n"))),
    [commits]
  );

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

        /* ── Keyframe animations for sprite-sheet mask ── */
        @keyframes smm-disintegrate {
          from { -webkit-mask-position: 0% 0; mask-position: 0% 0; }
          to   { -webkit-mask-position: 100% 0; mask-position: 100% 0; }
        }
        @keyframes smm-materialize {
          from { -webkit-mask-position: 100% 0; mask-position: 100% 0; }
          to   { -webkit-mask-position: 0% 0; mask-position: 0% 0; }
        }

        /* Apply mask image to all entering/leaving tokens */
        .magic-move-wrapper .shiki-magic-move-enter-active,
        .magic-move-wrapper .shiki-magic-move-leave-active {
          mask-image: url('${maskUrl || ""}');
          -webkit-mask-image: url('${maskUrl || ""}');
          mask-size: 2400% 100%;
          -webkit-mask-size: 2400% 100%;
          mask-repeat: no-repeat;
          -webkit-mask-repeat: no-repeat;
        }

        /* Override library opacity:0 — the mask handles visibility */
        .magic-move-wrapper .shiki-magic-move-enter-from,
        .magic-move-wrapper .shiki-magic-move-leave-to {
          opacity: 1 !important;
        }

        /* Entering tokens: materialize from dust */
        .magic-move-wrapper .shiki-magic-move-enter-active {
          color: #4ade80 !important;
          animation: smm-materialize var(--smm-duration, .8s) steps(23) forwards !important;
        }

        /* Leaving tokens: disintegrate into dust */
        .magic-move-wrapper .shiki-magic-move-leave-active {
          color: #f87171 !important;
          animation: smm-disintegrate var(--smm-duration, .8s) steps(23) forwards !important;
        }
      `}</style>
      <ShikiMagicMovePrecompiled
        steps={steps}
        step={currentIndex}
        animate={true}
        options={{
          duration: animDuration,
          stagger: 0.03,
          lineNumbers: false,
        }}
      />
    </div>
  );
}

// ─── Nav ───
function CommitNav({ commits, currentIndex, onNavigate, playing, onTogglePlay, speed, onSpeedChange }) {
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
      } else if (e.key === "]" || e.key === "ArrowUp") {
        e.preventDefault();
        onSpeedChange?.(1);
      } else if (e.key === "[" || e.key === "ArrowDown") {
        e.preventDefault();
        onSpeedChange?.(-1);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [ci, nav, onSpeedChange]);

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
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <button style={btn(false)} onClick={() => onSpeedChange?.(-1)}>&minus;</button>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.62rem",
            color: "#a08c6a",
            minWidth: "32px",
            textAlign: "center",
          }}>
            {speed}x
          </span>
          <button style={btn(false)} onClick={() => onSpeedChange?.(1)}>+</button>
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.54rem",
          color: "#3a3530",
        }}>
          &larr; &rarr; or spacebar &bull; [ ] speed
        </div>
      </div>
    </>
  );
}

// ─── Main Playback Component ───
export default function Playback({ docId, onBack, initialData }) {
  const [data, setData] = useState(initialData || null);
  const [error, setError] = useState(null);
  const [ci, setCi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1); // index into SPEED_STEPS, default 1x
  const speed = SPEED_STEPS[speedIdx];
  const interval = Math.round(BASE_INTERVAL / speed);
  const smmDuration = Math.round(BASE_SMM_DURATION / speed);
  const ivRef = useRef(null);

  const handleSpeedChange = useCallback((dir) => {
    setSpeedIdx(i => Math.max(0, Math.min(SPEED_STEPS.length - 1, i + dir)));
  }, []);

  useEffect(() => {
    if (initialData) return;
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
        setData(d);
      })
      .catch(() => setError("failed to load playback data"));
  }, [docId, initialData]);

  const handleNavigate = useCallback((n) => {
    if (!data) return;
    setCi((p) => {
      return Math.max(0, Math.min(n, data.commits.length - 1));
    });
  }, [data]);

  useEffect(() => {
    if (!data) return;
    if (playing) {
      ivRef.current = setInterval(() => {
        setCi(p => {
          if (p >= data.commits.length - 1) { setPlaying(false); return p; }
          return p + 1;
        });
      }, interval);
    }
    return () => clearInterval(ivRef.current);
  }, [playing, data, interval]);

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
          git log
        </span>
      </div>

      <MagicMoveRenderer
        commits={data.commits}
        currentIndex={ci}
        animDuration={smmDuration}
      />

      <CommitNav
        commits={data.commits}
        currentIndex={ci}
        onNavigate={handleNavigate}
        playing={playing}
        onTogglePlay={() => {
          if (ci >= data.commits.length - 1) handleNavigate(0);
          setPlaying(p => !p);
        }}
        speed={speed}
        onSpeedChange={handleSpeedChange}
      />
    </div>
  );
}
