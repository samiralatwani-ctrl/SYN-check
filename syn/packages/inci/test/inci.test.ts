import { describe, expect, it } from 'vitest';
import { canonical, compareLists, parseIngredientList } from '../src';

describe('parse', () => {
  it('splits, normalises and keeps parentheses together', () => {
    const p = parseIngredientList('Ingredients: Aqua (Water), Glycerin, PEG-40 Hydrogenated Castor Oil, Copper Tripeptide-1*, Ci 77891.');
    expect(p.items).toEqual(['AQUA (WATER)', 'GLYCERIN', 'PEG-40 HYDROGENATED CASTOR OIL', 'COPPER TRIPEPTIDE-1', 'CI 77891']);
  });
  it('commas inside parentheses do not split', () => {
    expect(parseIngredientList('Water, Butylene Glycol (1,3), Glycerin').items).toEqual(['WATER', 'BUTYLENE GLYCOL (1,3)', 'GLYCERIN']);
  });
  it('separates "may contain" shade ingredients', () => {
    const p = parseIngredientList('Talc, Mica, Dimethicone. [+/- May contain: CI 77491, CI 77492, CI 77499]');
    expect(p.items).toEqual(['TALC', 'MICA', 'DIMETHICONE']);
    expect(p.mayContain).toEqual(['CI 77491', 'CI 77492', 'CI 77499']);
  });
  it('multilingual may-contain headers and text after the closing bracket', () => {
    const p = parseIngredientList('NYLON-12, [May Contain/Peut Contenir/:D&C VIOLET NO. 2 (CI 60725)]. how to apply Step 1');
    expect(p.items).toEqual(['NYLON-12']);
    expect(p.mayContain).toEqual(['D&C VIOLET NO. 2 (CI 60725)']);
    expect(parseIngredientList('Silica [+/- May contain/Peut contenir/+/-: Mica, CI 77891]').mayContain).toEqual(['MICA', 'CI 77891']);
  });
  it('Turkish and Arabic headers', () => {
    expect(parseIngredientList('İçindekiler: Aqua, Glycerin').items).toEqual(['AQUA', 'GLYCERIN']);
    expect(parseIngredientList('المكونات: Aqua, Glycerin').items).toEqual(['AQUA', 'GLYCERIN']);
  });
});

describe('synonyms', () => {
  it('EU and US naming conventions meet', () => {
    expect(canonical('Water')).toBe(canonical('Aqua'));
    expect(canonical('Aqua/Water/Eau')).toBe(canonical('Aqua (Water)'));
    expect(canonical('Fragrance')).toBe(canonical('Parfum'));
    expect(canonical('Titanium Dioxide')).toBe(canonical('CI 77891'));
    expect(canonical('Glycerin')).not.toBe(canonical('Aqua'));
  });
});

describe('compare', () => {
  const ref = ['AQUA', 'GLYCERIN', 'NIACINAMIDE', 'PHENOXYETHANOL', 'PARFUM'];
  it('order-only difference', () => {
    const c = compareLists(['Water', 'Niacinamide', 'Glycerin', 'Phenoxyethanol', 'Fragrance'], ref);
    expect(c).toMatchObject({ sameSet: true, sameOrder: false, nonActiveDiffCount: 0, activeChanged: false });
    expect(c.moved).toEqual(['NIACINAMIDE', 'GLYCERIN']);
  });
  it('identical (with naming conventions) is same set and order', () => {
    expect(compareLists(['Water', 'Glycerin', 'Niacinamide', 'Phenoxyethanol', 'Fragrance'], ref)).toMatchObject({ sameSet: true, sameOrder: true });
  });
  it('content difference counts non-actives and flags actives', () => {
    const c = compareLists(['Aqua', 'Glycerin', 'Phenoxyethanol', 'Parfum', 'Methylparaben'], ref, new Set(['Niacinamide']));
    expect(c.removed).toEqual(['NIACINAMIDE']);
    expect(c.added).toEqual(['METHYLPARABEN']);
    expect(c.activeChanged).toBe(true);
    expect(c.nonActiveDiffCount).toBe(1);
  });
});
