// src/editor/pause-ring.js

/**
 * Creates a pause ring controller. Returns a cancel function.
 *
 * @param {object} options
 * @param {Element} options.fillEl - SVG circle element
 * @param {Element} options.labelEl - Text label element
 * @param {() => number} options.getThreshold - Returns current threshold in ms
 * @param {() => number} options.getLastKeystroke - Returns last keystroke timestamp
 * @param {() => boolean} options.getIsTyping - Returns current isTyping flag
 * @param {(elapsed: number, threshold: number) => void} options.onTick - Called each frame when elapsed >= threshold; let caller handle isTyping = false / commit
 */
export function createPauseRing({ fillEl, labelEl, getThreshold, getLastKeystroke, getIsTyping, onTick }) {
  let frame;
  function update() {
    const now = Date.now();
    const elapsed = now - getLastKeystroke();
    const threshold = getThreshold();

    if (getIsTyping() && elapsed < threshold) {
      const progress = elapsed / threshold;
      const offset = 88 * (1 - progress);
      fillEl.style.strokeDashoffset = offset;
      fillEl.classList.add("active");
      labelEl.textContent = ((threshold - elapsed) / 1000).toFixed(1) + "s \u2192 commit";
    } else if (getIsTyping() && elapsed >= threshold) {
      fillEl.style.strokeDashoffset = 0;
      onTick?.(elapsed, threshold); // let caller handle the isTyping = false / commit
    } else {
      fillEl.style.strokeDashoffset = 88;
      fillEl.classList.remove("active");
      labelEl.textContent = "pause \u2192 commit";
    }

    frame = requestAnimationFrame(update);
  }
  frame = requestAnimationFrame(update);
  return () => cancelAnimationFrame(frame);
}
