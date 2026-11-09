/**
 * Visual fingerprint v1 (EXPERIMENTAL, CLAUDE.md §5.5). A deterministic 128-number vector:
 *   - 64: structure hash (difference hash on a 9x8 grey thumbnail), as +1/-1
 *   - 48: colour histogram, 12 hues x 4 saturation/brightness bands (only coloured pixels)
 *   - 16: brightness histogram
 * Each block is L2-normalised and weighted, so cosine similarity is in [-1, 1] (≈0..1 for real photos).
 * It is NOT a neural embedding: it is explainable and cheap, and sensitive to framing and light. That is
 * why the signal it feeds is low-weight, labelled "experimental", and can never produce "mismatch" alone.
 */
export const VISUAL_VERSION = 'visual-v1';
export const VISUAL_DIM = 128;

export interface Pixels { width: number; height: number; rgba: Uint8Array | Uint8ClampedArray }

/** Box-average resample of a region into an n x m grid of [r,g,b]. */
function grid(p: Pixels, cols: number, rows: number): Float64Array {
  const out = new Float64Array(cols * rows * 3);
  for (let gy = 0; gy < rows; gy++) {
    const y0 = Math.floor((gy * p.height) / rows), y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * p.height) / rows));
    for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.floor((gx * p.width) / cols), x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * p.width) / cols));
      let r = 0, g = 0, b = 0, n = 0;
      const stepY = Math.max(1, Math.floor((y1 - y0) / 16)), stepX = Math.max(1, Math.floor((x1 - x0) / 16));
      for (let y = y0; y < y1; y += stepY) for (let x = x0; x < x1; x += stepX) {
        const i = (y * p.width + x) * 4;
        r += p.rgba[i]; g += p.rgba[i + 1]; b += p.rgba[i + 2]; n++;
      }
      const o = (gy * cols + gx) * 3;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return out;
}

function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60) + 360) % 360, mx === 0 ? 0 : d / mx, mx / 255];
}

const normalise = (v: number[], weight: number) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => (x / n) * weight);
};

export function visualVector(p: Pixels): number[] {
  if (p.width < 8 || p.height < 8) throw new Error('image too small');
  // structure: difference hash
  const g = grid(p, 9, 8);
  const lum = (i: number) => 0.299 * g[i * 3] + 0.587 * g[i * 3 + 1] + 0.114 * g[i * 3 + 2];
  const dhash: number[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) dhash.push(lum(y * 9 + x) < lum(y * 9 + x + 1) ? 1 : -1);
  // colour + brightness histograms on a 32x32 grid
  const c = grid(p, 32, 32);
  const hue = new Array(48).fill(0), bright = new Array(16).fill(0);
  for (let i = 0; i < 32 * 32; i++) {
    const [h, s, v] = hsv(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]);
    bright[Math.min(15, Math.floor(v * 16))]++;
    if (s > 0.15 && v > 0.15) hue[Math.min(11, Math.floor(h / 30)) * 4 + Math.min(3, Math.floor(s * 4))]++;
  }
  return [...normalise(dhash, 0.6), ...normalise(hue, 0.6), ...normalise(bright, 0.5281)];
}

/** Cosine similarity of two fingerprints (same version). */
export function similarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== VISUAL_DIM || b.length !== VISUAL_DIM) throw new Error('fingerprint length mismatch');
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < VISUAL_DIM; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
