import { describe, expect, it } from 'vitest';
import { checkDigitValid, interpretScan, parseElementString, parseGs1Date, toGtin14 } from '../src';
import * as api from '../src';

const NOW = new Date('2026-11-09T00:00:00Z');

describe('check digit', () => {
  it.each([
    ['4006381333931', true],   // EAN-13
    ['4006381333932', false],
    ['96385074', true],        // EAN-8
    ['036000291452', true],    // UPC-A
    ['00012345600012', true],  // GTIN-14
    ['12345', false], ['abcdefghijklm', false], ['', false],
  ])('%s -> %s', (d, ok) => expect(checkDigitValid(d)).toBe(ok));

  it('pads to GTIN-14 and rejects bad numbers', () => {
    expect(toGtin14('036000291452')).toBe('00036000291452');
    expect(toGtin14('4006381333932')).toBeNull();
  });
  it('UPC-A and its EAN-13 form (iOS) normalise to the same GTIN-14', () => {
    expect(interpretScan('upc_a', '036000291452').gtin14).toBe(interpretScan('ean13', '0036000291452').gtin14);
  });
});

describe('GS1 dates', () => {
  it('day and end-of-month', () => {
    expect(parseGs1Date('270131', NOW)).toEqual({ iso: '2027-01-31', precision: 'day', raw: '270131' });
    expect(parseGs1Date('270100', NOW)).toEqual({ iso: '2027-01', precision: 'month', raw: '270100' });
  });
  it('invalid dates are rejected, never guessed', () => {
    expect(parseGs1Date('271301', NOW)).toBeNull();
    expect(parseGs1Date('270231', NOW)).toBeNull();
  });
  it('century window', () => {
    expect(parseGs1Date('990101', NOW)?.iso).toBe('1999-01-01');
    expect(parseGs1Date('500101', NOW)?.iso).toBe('2050-01-01');
  });
});

describe('element strings (DataMatrix)', () => {
  it('raw with GS separators', () => {
    const p = parseElementString(']d20100036000291452211234567\x1d1727010010LOT-42', NOW);
    expect(p.fields).toEqual({ gtin: '00036000291452', serial: '1234567', expiryDate: '270100', batch: 'LOT-42' });
    expect(p.gtinValid).toBe(true);
    expect(p.expiry).toEqual({ iso: '2027-01', precision: 'month', raw: '270100' });
  });
  it('human-readable form', () => {
    const p = parseElementString('(01)00036000291452(11)250201(17)270100(10)1005654957', NOW);
    expect(p.fields.batch).toBe('1005654957');
    expect(p.production?.iso).toBe('2025-02-01');
  });
  it('unknown AI stops parsing and is reported', () => {
    const p = parseElementString('0100036000291452' + '99XYZ', NOW);
    expect(p.fields.gtin).toBe('00036000291452');
    expect(p.unknownAis.length).toBe(1);
  });
  it('DataMatrix scan exposes GTIN + batch + expiry', () => {
    const s = interpretScan('datamatrix', '010036000291452\x1d10ABC\x1d17270131', NOW);
    // first AI 01 must be 14 digits: this one is 13 -> invalid, no GTIN
    expect(s.gtin14).toBeNull();
    const ok = interpretScan('datamatrix', '010003600029145210ABC\x1d17270131', NOW);
    expect(ok.gtin14).toBe('00036000291452');
    expect(ok.gs1?.fields.batch).toBe('ABC');
    expect(ok.gs1?.expiry?.iso).toBe('2027-01-31');
  });
});

it('never maps a GS1 prefix to a country of origin', () => {
  expect(Object.keys(api).some((k) => /country|origin|prefix/i.test(k))).toBe(false);
});
