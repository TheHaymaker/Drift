/**
 * Generates a pixel-disintegration sprite sheet as a data URL.
 *
 * The sprite sheet is an 8×8 grid of frames (64 total).
 * Frame 0 = fully visible (all white), frame 63 = fully hidden (all black).
 * Each pixel is assigned a random threshold; frames progressively turn
 * pixels from white to black based on that threshold.
 *
 * The resulting data URL is used as a CSS mask-image with
 * mask-size: 800% 800% and stepped transitions through mask-position.
 */

let cached = null;

export function generateDisintegrationMask(cellSize = 128, cols = 8, rows = 8) {
  if (cached) return cached;

  const totalFrames = cols * rows; // 64
  const width = cellSize * cols;
  const height = cellSize * rows;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Generate a noise field — one random threshold per pixel within a cell
  const thresholds = new Float32Array(cellSize * cellSize);
  for (let i = 0; i < thresholds.length; i++) {
    thresholds[i] = Math.random();
  }

  // Draw each frame
  const imgData = ctx.createImageData(cellSize, cellSize);
  for (let frame = 0; frame < totalFrames; frame++) {
    const col = frame % cols;
    const row = Math.floor(frame / cols);

    // progress: 0 = fully visible (white), 1 = fully hidden (black)
    const progress = frame / (totalFrames - 1);

    for (let i = 0; i < thresholds.length; i++) {
      // Pixel is white (visible) if its threshold > progress
      const visible = thresholds[i] > progress ? 255 : 0;
      const off = i * 4;
      imgData.data[off] = visible;
      imgData.data[off + 1] = visible;
      imgData.data[off + 2] = visible;
      imgData.data[off + 3] = 255;
    }

    ctx.putImageData(imgData, col * cellSize, row * cellSize);
  }

  cached = canvas.toDataURL("image/png");
  return cached;
}
