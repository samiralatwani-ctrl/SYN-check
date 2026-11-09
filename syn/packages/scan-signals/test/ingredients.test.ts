// Phase-4 acceptance and ingredient edge cases. TEST_ reference lists.
import { evaluate } from '@syn/rules-engine';
import { describe, expect, it } from 'vitest';
import { buildScan, type FormulaVersion, type Reference } from '../src';
import { label } from './helpers';

const TODAY = '2026-11-09';
const v = (id: string, names: string[], actives: string[] = [], date = '2026-01-01'): FormulaVersion => ({
  id, valid_from: date, source_url: `https://example.test/${id}`, source_title: 'TEST_ official', source_date: date,
  ingredients: names.map((n, i) => ({ position: i + 1, inci_name: n, is_active: actives.includes(n) })),
});
const LATEST = v('TEST_v2', ['AQUA', 'GLYCERIN', 'NIACINAMIDE', 'PHENOXYETHANOL', 'PARFUM'], ['NIACINAMIDE']);
const OLDER = v('TEST_v1', ['AQUA', 'GLYCERIN', 'NIACINAMIDE', 'METHYLPARABEN', 'PARFUM'], ['NIACINAMIDE'], '2023-01-01');
const ref = (category: string | null = null, regulatory_class: 'cosmetic' = 'cosmetic'): Reference => ({
  variants: [{ variant_id: 'TEST_v', product_id: 'TEST_p', external_ref: 'TEST_IQB-1', official_name: 'TEST_ Cream', brand: 'TEST_',
    market: null, verification_status: 'verified', regulatory_class, category, package_text: null, concentration_text: null,
    gtin_source: null, formula_versions: [LATEST, OLDER] }],
  alerts: [],
});
const run = (ingredients: string, r = ref(), extra: Partial<Parameters<typeof label>[0]> = {}) => {
  const x = label({ name: 'TEST_ Cream', batch: 'TEST1', ingredients, ...extra });
  const b = buildScan({ label: { extraction: x, confirmed: { product_name: { value: 'TEST_ Cream' }, batch: { value: 'TEST1' } } },
    reference: r, identifiedBy: 'label_name', today: TODAY });
  return { b, v: evaluate(b.input) };
};

describe('phase 4 acceptance', () => {
  it('ingredient ORDER differs only -> "minor differences"', () => {
    const { v: verdict } = run('Ingredients: Water, Niacinamide, Glycerin, Phenoxyethanol, Fragrance.');
    expect([verdict.verdict, verdict.step]).toEqual(['minor', 'S5_minor']);
    expect(verdict.reasons[0].signal.type).toBe('ingredients_order');
  });
});

describe('ingredients', () => {
  it('same list under other naming conventions -> no difference reported', () => {
    const { b } = run('Aqua/Water/Eau, Glycerin, Niacinamide, Phenoxyethanol, Parfum (Fragrance)');
    expect(b.input.signals.filter((s) => s.type.startsWith('ingredients_')).map((s) => s.outcome)).toEqual(['match', 'match']);
  });
  it('list equal to an OLDER official version -> minor (reformulation), even though a preservative changed', () => {
    const { v: verdict } = run('Aqua, Glycerin, Niacinamide, Methylparaben, Parfum');
    expect(verdict.verdict).toBe('minor');
  });
  it('one non-active added -> minor; three changed -> suspect', () => {
    expect(run('Aqua, Glycerin, Niacinamide, Phenoxyethanol, Parfum, Limonene').v.verdict).toBe('minor');
    expect(run('Aqua, Glycerin, Niacinamide, Talc, Alcohol, Limonene').v.verdict).toBe('suspect');
  });
  it('active substance missing -> critical, but from an unconfirmed photo reading it stays "suspect" (D-005)', () => {
    const { v: verdict } = run('Aqua, Glycerin, Phenoxyethanol, Parfum');
    expect(verdict.verdict).toBe('suspect');
    expect(verdict.annotations).toContain('confirm_ocr_reading');
  });
  it('perfume: content differences weigh less (CLAUDE.md §8)', () => {
    expect(run('Aqua, Glycerin, Niacinamide, Talc, Alcohol, Limonene', ref('fragrance')).v.verdict).toBe('minor');
  });
  it('truncated or low-confidence lists are not compared', () => {
    expect(run('Aqua, Glycerin', ref(), { truncated: true }).b.input.signals.some((s) => s.type.startsWith('ingredients_'))).toBe(false);
    expect(run('Aqua, Talc, Mica', ref(), { ingredientsConf: 0.6 }).b.input.signals.some((s) => s.type.startsWith('ingredients_'))).toBe(false);
  });
  it('no official list -> nothing compared, nothing invented', () => {
    const r = ref(); r.variants[0].formula_versions = [];
    expect(run('Aqua, Talc', r).b.input.signals.some((s) => s.type.startsWith('ingredients_'))).toBe(false);
  });
});
