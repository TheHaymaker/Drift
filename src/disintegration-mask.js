/**
 * Generates a pixel-disintegration sprite sheet as a data URL.
 *
 * The sprite sheet is a single row of 24 frames (1×24 layout).
 * Frame 0 = fully visible (all pixels opaque), frame 23 = fully hidden (all transparent).
 * Each pixel is assigned a random threshold; frames progressively turn
 * pixels transparent based on that threshold.
 *
 * Uses the ALPHA channel for masking (CSS mask-mode defaults to alpha).
 * Used with mask-size: 2400% 100% and @keyframes animation with steps(23).
 */

let cached = null;

export const MASK_FRAMES = 24;

export function generateDisintegrationMask(cellSize = 128) {
  if (cached) return cached;

  const frames = MASK_FRAMES;
  const width = cellSize * frames;
  const height = cellSize;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Generate a noise field — one random threshold per pixel within a cell
  const thresholds = new Float32Array(cellSize * cellSize);
  for (let i = 0; i < thresholds.length; i++) {
    thresholds[i] = Math.random();
  }

  // Draw each frame as a column in the single-row strip
  const imgData = ctx.createImageData(cellSize, cellSize);
  for (let frame = 0; frame < frames; frame++) {
    // progress: 0 = fully visible, 1 = fully hidden
    const progress = frame / (frames - 1);

    for (let i = 0; i < thresholds.length; i++) {
      const off = i * 4;
      // White pixel, vary alpha: opaque if threshold > progress, transparent otherwise
      imgData.data[off] = 255;
      imgData.data[off + 1] = 255;
      imgData.data[off + 2] = 255;
      imgData.data[off + 3] = thresholds[i] > progress ? 255 : 0;
    }

    ctx.putImageData(imgData, frame * cellSize, 0);
  }

  cached = canvas.toDataURL("image/png");
  return cached;
}
