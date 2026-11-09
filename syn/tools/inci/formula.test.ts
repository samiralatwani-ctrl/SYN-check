import { describe, expect, it } from 'vitest';
import { findCandidates, inciScore } from './formula.mts';

const page = (body: string) => `<html><head><title>TEST_ Serum</title></head><body>${body}</body></html>`;

describe('official list extraction (TEST_ pages)', () => {
  it('finds a real INCI list and ignores marketing copy that mentions ingredients', () => {
    const html = page(`<p>Ingredients that help your skin glow, with peptides, for all skin types, and more, now, today.</p>
      <div><h3>Ingredients</h3><p>Aqua (Water), Glycerin, Niacinamide, Pentylene Glycol, Phenoxyethanol, Xanthan Gum, Citric Acid.</p></div>
      <script>var ingredients = "a, b, c, d, e, f, g";</script>`);
    const { title, blocks } = findCandidates(html);
    expect(title).toBe('TEST_ Serum');
    expect(blocks).toEqual(['Aqua (Water), Glycerin, Niacinamide, Pentylene Glycol, Phenoxyethanol, Xanthan Gum, Citric Acid.']);
  });
  it('prose scores low, INCI lists score high, short lists score zero', () => {
    expect(inciScore('Peptides that help the skin, for your face, and the eyes, with care, to glow, now')).toBeLessThan(0.5);
    expect(inciScore('Aqua, Glycerin, Urea, Carbomer, Phenoxyethanol, Ethylhexylglycerin')).toBe(1);
    expect(inciScore('Aqua, Glycerin')).toBe(0);
  });
  it('a page without a list yields no candidate (nothing is guessed)', () => {
    expect(findCandidates(page('<p>Discover our best seller. Add to bag.</p>')).blocks).toEqual([]);
  });
});
