/**
 * GS1 helpers that run on the device (no network).
 * NOTE (CLAUDE.md §5.1): a GS1 prefix identifies the GS1 member organisation that issued the number,
 * NOT the country of origin. This package deliberately exposes no prefix-to-country function.
 */

export type Symbology = 'ean13' | 'ean8' | 'upc_a' | 'upc_e' | 'qr' | 'datamatrix' | 'unknown';

/** Mod-10 check digit used by GTIN-8/12/13/14. */
export function checkDigitValid(digits: string): boolean {
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** Left-pad a valid GTIN-8/12/13/14 to GTIN-14 (the form stored in the database). */
export function toGtin14(digits: string): string | null {
  return checkDigitValid(digits) ? digits.padStart(14, '0') : null;
}

export interface Gs1Date { iso: string; precision: 'day' | 'month'; raw: string }

/** YYMMDD per GS1 General Specifications 7.12: DD=00 means "end of month" (month precision). */
export function parseGs1Date(raw: string, now = new Date()): Gs1Date | null {
  if (!/^\d{6}$/.test(raw)) return null;
  const yy = Number(raw.slice(0, 2)), mm = Number(raw.slice(2, 4)), dd = Number(raw.slice(4, 6));
  if (mm < 1 || mm > 12) return null;
  // century: within -49..+50 years of the current year
  const cur = now.getUTCFullYear(), base = cur - (cur % 100);
  let year = base + yy;
  if (year - cur > 50) year -= 100; else if (cur - year >= 50) year += 100;
  const m = String(mm).padStart(2, '0');
  if (dd === 0) return { iso: `${year}-${m}`, precision: 'month', raw };
  const last = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  if (dd > last) return null;
  return { iso: `${year}-${m}-${String(dd).padStart(2, '0')}`, precision: 'day', raw };
}

/** Application Identifiers we use. fixed = data length when fixed; variable ones end at GS (\x1d) or end of data. */
const AIS: Record<string, { name: keyof Gs1Fields; fixed?: number; max: number }> = {
  '01': { name: 'gtin', fixed: 14, max: 14 },
  '10': { name: 'batch', max: 20 },
  '11': { name: 'productionDate', fixed: 6, max: 6 },
  '17': { name: 'expiryDate', fixed: 6, max: 6 },
  '21': { name: 'serial', max: 20 },
};

export interface Gs1Fields {
  gtin?: string; batch?: string; productionDate?: string; expiryDate?: string; serial?: string;
}
export interface Gs1Parsed {
  fields: Gs1Fields;
  production?: Gs1Date | null;
  expiry?: Gs1Date | null;
  gtinValid?: boolean;
  unknownAis: string[];
  errors: string[];
}

const GS = '\x1d';

/**
 * Parse a GS1 element string from a DataMatrix/QR (raw, with GS separators and optional "]d2" symbology
 * identifier) or the human-readable form "(01)…(17)…(10)…".
 */
export function parseElementString(input: string, now = new Date()): Gs1Parsed {
  const out: Gs1Parsed = { fields: {}, unknownAis: [], errors: [] };
  let s = input.trim().replace(/^\]([dQ]\d|C1|e0)/, '');
  if (s.startsWith('(')) {
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) assign(out, m[1], m[2].trim());
  } else {
    let i = 0;
    while (i < s.length) {
      if (s[i] === GS) { i++; continue; }
      const ai = s.slice(i, i + 2);
      const def = AIS[ai];
      if (!def) { out.unknownAis.push(s.slice(i, i + 4)); out.errors.push(`unknown AI at ${i}`); break; }
      i += 2;
      let val: string;
      if (def.fixed) { val = s.slice(i, i + def.fixed); i += def.fixed; }
      else { const end = s.indexOf(GS, i); val = s.slice(i, end === -1 ? undefined : end); i = end === -1 ? s.length : end + 1; }
      assign(out, ai, val);
    }
  }
  if (out.fields.gtin) out.gtinValid = checkDigitValid(out.fields.gtin);
  if (out.fields.productionDate) out.production = parseGs1Date(out.fields.productionDate, now);
  if (out.fields.expiryDate) out.expiry = parseGs1Date(out.fields.expiryDate, now);
  return out;
}

function assign(out: Gs1Parsed, ai: string, val: string) {
  const def = AIS[ai];
  if (!def) { out.unknownAis.push(ai); return; }
  if ((def.fixed && val.length !== def.fixed) || val.length > def.max || val.length === 0) {
    out.errors.push(`AI ${ai}: bad length`); return;
  }
  out.fields[def.name] = val;
}

export interface ScannedCode {
  symbology: Symbology;
  gtin14: string | null;          // null when the check digit fails or there is no GTIN
  checkDigitValid: boolean;
  gs1?: Gs1Parsed;                // for DataMatrix / GS1 QR
  raw: string;
}

/** Normalise whatever the camera returned into one structure. */
export function interpretScan(symbology: Symbology, data: string, now = new Date()): ScannedCode {
  const raw = data;
  if (symbology === 'datamatrix' || symbology === 'qr' || /^(\]d2|\(01\)|01\d{14})/.test(data)) {
    const looksGs1 = /^(\]d2|\]Q3|\(01\)|01\d{14})/.test(data) || data.includes(GS);
    if (looksGs1) {
      const gs1 = parseElementString(data, now);
      const g = gs1.fields.gtin;
      return { symbology, gs1, raw, checkDigitValid: !!g && checkDigitValid(g), gtin14: g ? toGtin14(g) : null };
    }
    return { symbology, raw, checkDigitValid: false, gtin14: null };
  }
  const digits = data.replace(/\s/g, '');
  const ok = checkDigitValid(digits);
  return { symbology, raw, checkDigitValid: ok, gtin14: ok ? digits.padStart(14, '0') : null };
}
