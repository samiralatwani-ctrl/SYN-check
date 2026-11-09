// Phase-2 acceptance and edge cases for barcode scans. All data is TEST_.
import { interpretScan } from '@syn/gs1';
import { evaluate } from '@syn/rules-engine';
import { describe, expect, it } from 'vitest';
import { buildBarcodeScan } from '../src/scan/buildSignals';
import type { LookupAlert, LookupResult, LookupVariant } from '../src/data/types';

const TODAY = '2026-11-09';
const NOW = new Date(`${TODAY}T00:00:00Z`);
const run = (sym: Parameters<typeof interpretScan>[0], data: string, lookup: LookupResult | null) => {
  const scan = interpretScan(sym, data, NOW);
  const ctx = buildBarcodeScan(scan, lookup, TODAY);
  return { ...ctx, v: evaluate(ctx.input) };
};
const empty = (gtin: string): LookupResult => ({ gtin, variants: [], alerts: [] });
const variant = (status: LookupVariant['verification_status'], cls: LookupVariant['regulatory_class'] = 'cosmetic'): LookupVariant => ({
  variant_id: 'TEST_v', product_id: 'TEST_p', external_ref: 'TEST_IQB-1', official_name: 'TEST_ product', brand: 'TEST_',
  market: null, verification_status: status, regulatory_class: cls, category: null, package_text: null, concentration_text: null,
  gtin_source: { url: 'https://example.test', title: 'TEST_', last_verified_at: '2026-11-09' },
});
const alert = (a: Partial<LookupAlert>): LookupAlert => ({ authority: 'TEST_AUTH', country: 'TR', product_text: 'TEST_', lot_text: 'Tüm seriler',
  lot_scope: 'all_batches', decision_date: '2026-10-01', source_url: 'https://example.test/a', ...a });

describe('phase 2 acceptance', () => {
  it('a VALID barcode that is not in the database gives "insufficient", never "match"', () => {
    const { v } = run('ean13', '5901234123457', empty('05901234123457'));
    expect(v.verdict).toBe('insufficient');
    expect(v.step).toBe('S2_no_reference');
  });
});

describe('barcode scans', () => {
  it('invalid check digit -> insufficient with "scan again" reason, no lookup needed', () => {
    const { v } = run('ean13', '5901234123458', null);
    expect(v.verdict).toBe('insufficient');
    expect(v.reasons.some((r) => r.signal.type === 'barcode_checksum' && r.signal.outcome === 'unavailable')).toBe(true);
  });
  it('candidate (unverified) product is never green', () => {
    const { v } = run('ean13', '4006381333931', { gtin: '04006381333931', variants: [variant('candidate_unverified')], alerts: [] });
    expect(v.verdict).toBe('insufficient');
  });
  it('verified product but barcode only -> insufficient (S3) and asks for the label', () => {
    const { v } = run('ean13', '4006381333931', { gtin: '04006381333931', variants: [variant('verified')], alerts: [] });
    expect([v.verdict, v.step]).toEqual(['insufficient', 'S3_too_little_read']);
    expect(v.missing).toContain('product_name');
  });
  it('barcode on an ALL-batches alert -> mismatch even when the product is unknown', () => {
    const { v } = run('ean13', '4670220302107', { gtin: '04670220302107', variants: [], alerts: [alert({})] });
    expect([v.verdict, v.step]).toEqual(['mismatch', 'S1_critical']);
  });
  it('batch-specific alert without a batch reading -> listed for the user to compare, verdict not forced', () => {
    const r = run('ean13', '8681863410056', { gtin: '08681863410056', variants: [], alerts: [alert({ lot_scope: 'specific', lot_text: 'NobEl-V2-08/22' })] });
    expect(r.v.verdict).toBe('insufficient');
    expect(r.batchAlertsToCheck.map((a) => a.lot_text)).toEqual(['NobEl-V2-08/22']);
  });
  it('DataMatrix batch equal to a banned batch -> mismatch', () => {
    const dm = '0108681863410056' + '10NOBEL-V2-08/22';
    const { v } = run('datamatrix', dm, { gtin: '08681863410056', variants: [], alerts: [alert({ lot_scope: 'specific', lot_text: 'NobEl-V2-08/22' })] });
    expect(v.verdict).toBe('mismatch');
  });
  it('DataMatrix: copied genuine batch with counterfeit dates -> mismatch; with genuine dates -> suspect', () => {
    const lookup: LookupResult = { gtin: '00036000291452', variants: [variant('verified', 'medical_device')], alerts: [alert({
      lot_scope: 'specific', lot_text: 'TEST1005654957', genuine_dates: '01.2023 / 12.2024', counterfeit_dates: '02.2025 / 01.2027' })] };
    const fake = run('datamatrix', '0100036000291452' + '11250201' + '17270100' + '10TEST1005654957', lookup);
    expect(fake.v.verdict).toBe('mismatch');
    expect(fake.v.annotations).toContain('medical_professional_only');
    const genuineDates = run('datamatrix', '0100036000291452' + '11230101' + '17241200' + '10TEST1005654957', lookup);
    expect(genuineDates.v.verdict).toBe('suspect');
    expect(genuineDates.v.annotations).toContain('expired_banner');   // 12.2024 is in the past
  });
  it('DataMatrix with expiry before manufacture -> mismatch (no OCR, so no confirmation needed)', () => {
    const { v } = run('datamatrix', '0100036000291452' + '11270101' + '17260101', empty('00036000291452'));
    expect(v.verdict).toBe('mismatch');
  });
  it('batch compare is exact apart from spaces/case: O vs 0 is NOT treated as equal', () => {
    const dm = '0108681863410056' + '10N0BEL-V2-08/22';
    const r = run('datamatrix', dm, { gtin: '08681863410056', variants: [], alerts: [alert({ lot_scope: 'specific', lot_text: 'NobEl-V2-08/22' })] });
    expect(r.v.verdict).not.toBe('mismatch');
  });
});
