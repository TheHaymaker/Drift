import { useState, useEffect, useRef, useCallback, useMemo, Component } from "react";
import { ShikiMagicMovePrecompiled } from "shiki-magic-move/react";
import "shiki-magic-move/style.css";
import { generateDisintegrationMask } from "./disintegration-mask.js";
import { htmlToKeyedTokens } from "./htmlTokenizer.js";

// ─── Error Boundary ───
class PlaybackErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="playback-error">
          <div className="playback-error-message">playback rendering failed</div>
          <button onClick={this.props.onBack} className="playback-error-back">
            &larr; back
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
          white-space: pre-wrap !important;
          word-wrap: break-word;
        }
        .magic-move-wrapper pre,
        .magic-move-wrapper code {
          font-family: var(--font-body) !important;
          font-size: var(--font-playback-size) !important;
          line-height: 42px !important;
          letter-spacing: 0.01em !important;
          background: transparent !important;
        }
        .magic-move-wrapper .shiki-magic-move-container span {
          color: var(--text) !important;
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
          color: var(--green) !important;
          animation: smm-materialize var(--smm-duration, .8s) steps(23) forwards !important;
        }

        /* Leaving tokens: disintegrate into dust */
        .magic-move-wrapper .shiki-magic-move-leave-active {
          color: var(--red) !important;
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

  return (
    <>
      <div className="playback-commit-bar">
        <div className="playback-commit-info">
          <span className="playback-commit-hash">{commit.hash}</span>
          <span className="playback-commit-date">{commit.date}</span>
          <span className="playback-commit-count">{ci + 1}/{commits.length}</span>
        </div>
        <div className="playback-commit-message">
          &ldquo;{commit.message}&rdquo;
        </div>
      </div>

      <div className="playback-controls">
        <div className="playback-dots">
          {commits.map((_, i) => (
            <button
              key={i}
              onClick={() => nav(i)}
              className={`playback-dot ${i === ci ? "playback-dot--active" : i < ci ? "playback-dot--visited" : "playback-dot--future"}`}
            />
          ))}
        </div>
        <div className="playback-btn-row">
          <button className="playback-btn playback-btn--default" onClick={() => nav(ci - 1)}>
            &larr; prev
          </button>
          <button
            className={`playback-btn ${playing ? "playback-btn--active" : "playback-btn--default"}`}
            onClick={() => {
              if (ci >= commits.length - 1) nav(0);
              onTogglePlay();
            }}
          >
            {playing ? "pause" : "play"}
          </button>
          <button className="playback-btn playback-btn--default" onClick={() => nav(ci + 1)}>
            next &rarr;
          </button>
        </div>
        <div className="playback-speed-row">
          <button className="playback-btn playback-btn--default" onClick={() => onSpeedChange?.(-1)}>&minus;</button>
          <span className="playback-speed-label">
            {speed}x
          </span>
          <button className="playback-btn playback-btn--default" onClick={() => onSpeedChange?.(1)}>+</button>
        </div>
        <div className="playback-hint">
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
  const savedSpeedIdx = parseInt(localStorage.getItem('drift-default-speed') ?? '1');
  const [speedIdx, setSpeedIdx] = useState(
    savedSpeedIdx >= 0 && savedSpeedIdx < SPEED_STEPS.length ? savedSpeedIdx : 1
  );
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
      <div className="playback-error">
        <div className="playback-error-message">{error}</div>
        <button onClick={onBack} className="playback-error-back">
          &larr; back
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="playback-loading">
        loading playback&hellip;
      </div>
    );
  }

  return (
    <PlaybackErrorBoundary onBack={onBack}>
      <div className="playback-container">
        <div className="playback-glow" />

        <div className="playback-header">
          <button onClick={onBack} className="playback-brand">
            drift
          </button>
          <span className="playback-label">
            git log
          </span>
          <a href="#/settings" className="settings-gear playback-settings-gear" title="settings">&#9881; settings</a>
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
    </PlaybackErrorBoundary>
  );
}
