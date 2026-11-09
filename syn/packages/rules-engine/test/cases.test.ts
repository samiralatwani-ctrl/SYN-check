// The TypeScript engine must reproduce every case in method/v1/cases.yaml (the same oracle as tools/method).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { evaluate, type Signal } from '../src';

const cases = parse(readFileSync(new URL('../../../method/v1/cases.yaml', import.meta.url), 'utf8')).cases as any[];

const toSignal = (s: any): Signal => ({
  type: s.type, outcome: s.outcome ?? 'match', confidence: s.confidence, source: s.source,
  userConfirmed: s.user_confirmed, severityOverride: s.severity_override,
  alert: s.alert && { alertKind: s.alert.alert_kind, datesEqual: s.alert.dates_equal, datesReadable: s.alert.dates_readable },
  ingredients: s.ingredients && { activeChanged: s.ingredients.active_changed, matchesOlderFormulaVersion: s.ingredients.matches_older_formula_version, nonActiveDiffCount: s.ingredients.non_active_diff_count },
});

describe('method v1 reference cases', () => {
  it.each(cases.map((c) => [c.id, c]))('%s', (_id, c: any) => {
    const v = evaluate({
      referenceStatus: c.context.reference_status, regulatoryClass: c.context.regulatory_class,
      purchaseChannel: c.context.purchase_channel, readable: c.readable, signals: c.signals.map(toSignal),
    });
    expect([v.verdict, v.step]).toEqual([c.expect.verdict, c.expect.step]);
    if (c.expect.annotations_include?.includes('social_media_caution')) expect(v.annotations).toContain('social_media_caution');
    if (c.expect.annotations_include?.includes('expired_banner')) expect(v.annotations).toContain('expired_banner');
    if (v.verdict === 'match') expect(v.annotations).toContain('match_is_not_authenticity');
  });
});

describe('edge cases', () => {
  it('unknown signal types are rejected, not ignored', () => {
    expect(() => evaluate({ referenceStatus: 'verified', regulatoryClass: 'cosmetic', readable: [], signals: [{ type: 'vibes', outcome: 'match' }] })).toThrow();
  });
  it('is deterministic', () => {
    const input = { referenceStatus: 'verified' as const, regulatoryClass: 'medical_device' as const, readable: ['gtin', 'batch'],
      signals: [{ type: 'barcode_lookup', outcome: 'match' as const }, { type: 'size', outcome: 'mismatch' as const }] };
    expect(evaluate(input)).toEqual(evaluate(input));
  });
  it('medical products always carry the professional-only annotation', () => {
    const v = evaluate({ referenceStatus: 'not_found', regulatoryClass: 'medical_device', readable: ['gtin'], signals: [] });
    expect(v.annotations).toContain('medical_professional_only');
  });
  it('mismatches are listed before matches', () => {
    const v = evaluate({ referenceStatus: 'verified', regulatoryClass: 'cosmetic', readable: ['gtin', 'size'],
      signals: [{ type: 'product_name', outcome: 'match' }, { type: 'size', outcome: 'mismatch' }] });
    expect(v.reasons[0].signal.type).toBe('size');
  });
});
