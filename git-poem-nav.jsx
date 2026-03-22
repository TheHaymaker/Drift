import { useEffect, useCallback } from "react";

/**
 * Shared commit navigation controls for the poem visualizer.
 * Used by both the atoms renderer and the Shiki Magic Move renderer.
 */
export default function CommitNav({
  commits,
  currentIndex,
  onNavigate,
  playing,
  onTogglePlay,
  mode,
  onToggleMode,
}) {
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
      <div
        style={{
          width: "100%",
          maxWidth: "580px",
          marginTop: "16px",
          padding: "14px 24px",
          borderTop: "1px solid #2a2520",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.68rem",
            color: "#6a6050",
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: "#a08c6a" }}>{commit.hash}</span>
          <span style={{ color: "#4a4030", fontSize: "0.62rem" }}>
            {commit.date}
          </span>
          <span style={{ color: "#3a3530", fontSize: "0.6rem" }}>
            {ci + 1}/{commits.length}
          </span>
        </div>
        <div
          style={{
            marginTop: "4px",
            fontFamily: "'EB Garamond', serif",
            fontStyle: "italic",
            fontSize: "0.86rem",
            color: "#7a6a50",
          }}
        >
          "{commit.message}"
        </div>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: "580px",
          marginTop: "18px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          zIndex: 1,
        }}
      >
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
                background:
                  i === ci ? "#a08c6a" : i < ci ? "#4a4030" : "#2a2520",
                transition: "all 0.4s ease",
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={btn(false)} onClick={() => nav(ci - 1)}>
            ← prev
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
            next →
          </button>
        </div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.54rem",
              color: "#3a3530",
            }}
          >
            ← → or spacebar • press m to switch mode
          </div>
          {onToggleMode && (
            <button
              style={btn(false)}
              onClick={onToggleMode}
            >
              {mode === "atoms" ? "magic-move" : "atoms"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
