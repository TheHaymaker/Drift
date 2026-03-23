import { useState, useEffect } from "react";
import { ShikiMagicMove } from "shiki-magic-move/react";
import { createHighlighter } from "shiki";
import "shiki-magic-move/style.css";
import { generateDisintegrationMask } from "./src/disintegration-mask.js";

/**
 * Shiki Magic Move renderer for the poem visualizer.
 * Animates transitions between commit snapshots using FLIP-based token animation.
 */
export default function MagicMoveRenderer({ commits, currentIndex }) {
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
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMaskUrl(generateDisintegrationMask());
  }, []);

  if (!highlighter) {
    return (
      <div
        style={{
          width: "100%",
          maxWidth: "580px",
          minHeight: "200px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.68rem",
          color: "#4a4030",
        }}
      >
        loading highlighter…
      </div>
    );
  }

  const code = commits[currentIndex].lines.join("\n");

  return (
    <div
      className="magic-move-wrapper"
      style={{
        width: "100%",
        maxWidth: "580px",
        position: "relative",
        zIndex: 1,
      }}
    >
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
