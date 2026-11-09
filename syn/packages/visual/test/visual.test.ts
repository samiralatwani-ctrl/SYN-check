import { describe, expect, it } from 'vitest';
import { similarity, visualVector, VISUAL_DIM, type Pixels } from '../src';

/** Synthetic TEST_ images: coloured bands with optional brightness change and offset. */
function img(w: number, h: number, paint: (x: number, y: number) => [number, number, number]): Pixels {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = paint(x, y); const i = (y * w + x) * 4;
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
  }
  return { width: w, height: h, rgba };
}
const pack = (k = 1, dx = 0) => img(200, 300, (x) => {
  const base = (x + dx) / 200 < 0.5 ? [200, 30, 40] : [240, 240, 240];
  return base.map((c) => Math.min(255, Math.round(c * k))) as [number, number, number];
});
const other = img(200, 300, (x, y) => (y < 150 ? [20, 60, 200] : [30, 160, 60]));

describe('visual fingerprint (experimental)', () => {
  it('has a fixed length and is deterministic', () => {
    const v = visualVector(pack());
    expect(v).toHaveLength(VISUAL_DIM);
    expect(visualVector(pack())).toEqual(v);
  });
  it('same pack scores higher than a different-looking pack', () => {
    const a = visualVector(pack());
    expect(similarity(a, visualVector(pack()))).toBeCloseTo(1, 6);
    expect(similarity(a, visualVector(pack(0.85)))).toBeGreaterThan(0.85);   // dimmer photo of the same pack
    expect(similarity(a, visualVector(other))).toBeLessThan(0.6);
  });
  it('is sensitive to framing — the reason it is low-weight and experimental', () => {
    const shifted = similarity(visualVector(pack()), visualVector(pack(1, 60)));
    expect(shifted).toBeLessThan(0.99);
  });
  it('rejects tiny images and mismatched vectors', () => {
    expect(() => visualVector(img(4, 4, () => [0, 0, 0]))).toThrow();
    expect(() => similarity([1], [1])).toThrow();
  });
});
