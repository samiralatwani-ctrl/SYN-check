// Phase-3 acceptance and label edge cases. Synthetic TEST_ inputs; the alert values mirror the real
// BASG alert (batch 1005654957, genuine 01.2023/12.2024, counterfeit 02.2025/01.2027) so the rule is exercised end to end.
import { evaluate } from '@syn/rules-engine';
import { describe, expect, it } from 'vitest';
import { buildScan, type Reference } from '../src';
import { label } from './helpers';

const TODAY = '2026-11-09';
const ULTRA4: Reference = {
  variants: [{
    variant_id: 'TEST_v', product_id: 'TEST_p', external_ref: 'TEST_IQB-0002', official_name: 'Juvéderm® ULTRA 4', brand: 'JUVÉDERM',
    market: null, verification_status: 'verified', regulatory_class: 'medical_device', category: 'filler',
    package_text: null, concentration_text: null, gtin_source: null,
  }],
  alerts: [{
    authority: 'BASG، النمسا', country: 'AT', product_text: 'Juvéderm ULTRA 4', lot_text: '1005654957', lot_scope: 'specific',
    decision_date: '2026-05-27', genuine_dates: '01.2023 / 12.2024', counterfeit_dates: '02.2025 / 01.2027', source_url: 'https://example.test/basg',
  }],
};
const run = (x: ReturnType<typeof label>, confirmed: Record<string, { value: string }> = {}) => {
  const b = buildScan({ label: { extraction: x, confirmed }, reference: ULTRA4, identifiedBy: 'label_name', today: TODAY });
  return { ...b, v: evaluate(b.input) };
};
const all = (x: ReturnType<typeof label>) => ({
  batch: { value: x.fields.batch.value! }, manufacture_date: { value: x.fields.manufacture_date.value!.iso },
  expiry_date: { value: x.fields.expiry_date.value!.iso }, product_name: { value: x.fields.product_name.value! },
});

describe('phase 3 acceptance', () => {
  const counterfeit = label({ brand: 'Juvéderm', name: 'ULTRA 4', batch: '1005654957', mfg: '2025-02', exp: '2027-01' });

  it('label with an alerted batch and the COUNTERFEIT dates gives "mismatch" once the user confirms the reading', () => {
    const { v } = run(counterfeit, all(counterfeit));
    expect([v.verdict, v.step]).toEqual(['mismatch', 'S1_critical']);
    expect(v.annotations).toContain('medical_professional_only');
  });
  it('before confirmation the same reading gives "suspect" and asks to confirm (D-005)', () => {
    const { v } = run(counterfeit);
    expect(v.verdict).toBe('suspect');
    expect(v.annotations).toContain('confirm_ocr_reading');
  });
});

describe('label reading', () => {
  it('alerted batch with the GENUINE dates -> suspect (copied batch cannot be told apart)', () => {
    const x = label({ brand: 'Juvéderm', name: 'ULTRA 4', batch: '1005654957', mfg: '2023-01', exp: '2024-12' });
    const { v } = run(x, all(x));
    expect(v.verdict).toBe('suspect');
    expect(v.annotations).toContain('expired_banner');
  });
  it('alerted batch, dates unreadable -> suspect', () => {
    const x = label({ brand: 'Juvéderm', name: 'ULTRA 4', batch: '1005654957' });
    expect(run(x, { batch: { value: '1005654957' } }).v.verdict).toBe('suspect');
  });
  it('different batch -> no alert; medical device still not green without an official barcode', () => {
    const x = label({ brand: 'Juvéderm', name: 'ULTRA 4', batch: 'TEST123', mfg: '2025-06', exp: '2027-05' });
    const { v } = run(x, all(x));
    expect(v.verdict).toBe('insufficient');
    expect(v.missing).toContain('barcode_lookup');
  });
  it('low-confidence batch is not used (never guessed)', () => {
    const x = label({ brand: 'Juvéderm', name: 'ULTRA 4', batch: '1005654957', batchConf: 0.6, mfg: '2025-02', exp: '2027-01' });
    const r = run(x);
    expect(r.used.batch).toBeUndefined();
    expect(r.batchAlertsToCheck).toHaveLength(2 - 1);
  });
  it('user correction replaces the read value and counts as confirmed', () => {
    const x = label({ brand: 'Juvéderm', name: 'ULTRA 4', batch: '1OO5654957', mfg: '2025-02', exp: '2027-01' });
    const { v } = run(x, { ...all(x), batch: { value: '1005654957' } });
    expect(v.verdict).toBe('mismatch');
  });
  it('expiry before manufacture on the label: suspect until confirmed, then mismatch', () => {
    const x = label({ name: 'TEST_', mfg: '2026-05', exp: '2025-05' });
    const b = (c = {}) => evaluate(buildScan({ label: { extraction: x, confirmed: c }, reference: null, identifiedBy: null, today: TODAY }).input).verdict;
    expect(b()).toBe('suspect');
    expect(b({ manufacture_date: { value: '2026-05' }, expiry_date: { value: '2025-05' } })).toBe('mismatch');
  });
  it('month vs day precision: same month is undecidable, earlier month is impossible', () => {
    const order = (mfg: string, exp: string) => buildScan({ label: { extraction: label({ name: 'TEST_', mfg, exp }), confirmed: {} },
      reference: null, identifiedBy: null, today: TODAY }).input.signals.find((s) => s.type === 'dates_order')?.outcome;
    expect(order('2025-02-15', '2025-02')).toBe('unavailable');
    expect(order('2025-02-15', '2025-01')).toBe('mismatch');
    expect(order('2025-02-15', '2025-02-15')).toBe('mismatch');
    expect(order('2025-02', '2027-01-31')).toBe('match');
  });
});
