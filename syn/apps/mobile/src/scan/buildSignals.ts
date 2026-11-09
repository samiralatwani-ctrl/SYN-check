import type { ScannedCode } from '@syn/gs1';
import type { RegulatoryClass, ReferenceStatus, ScanInput, Signal } from '@syn/rules-engine';
import type { LookupAlert, LookupResult, LookupVariant } from '../data/types';

/**
 * Turns a barcode scan + database lookup into rules-engine input. Pure and deterministic:
 * `today` is passed in, nothing is read from the clock or the network here.
 */
export interface BarcodeScanContext {
  input: ScanInput;
  variant: LookupVariant | null;
  /** Batch-specific alerts we could not compare because no batch was read (shown as "check your batch"). */
  batchAlertsToCheck: LookupAlert[];
}

const rank = (s: string) => (s === 'verified' ? 0 : s === 'candidate_unverified' ? 1 : 2);

export function buildBarcodeScan(scan: ScannedCode, lookup: LookupResult | null, today: string): BarcodeScanContext {
  const signals: Signal[] = [];
  const readable: string[] = [];

  if (!scan.checkDigitValid || !scan.gtin14) {
    signals.push({ type: 'barcode_checksum', outcome: 'unavailable', source: 'scanner', evidence: { found: scan.raw } });
    return { input: { referenceStatus: 'not_found', regulatoryClass: 'unknown', readable, signals }, variant: null, batchAlertsToCheck: [] };
  }
  signals.push({ type: 'barcode_checksum', outcome: 'match', source: 'scanner', evidence: { found: scan.gtin14 } });
  readable.push('gtin');

  const variants = [...(lookup?.variants ?? [])].sort((a, b) => rank(a.verification_status) - rank(b.verification_status));
  const variant = variants[0] ?? null;
  const referenceStatus: ReferenceStatus = variant ? (variant.verification_status as ReferenceStatus) : 'not_found';
  const regulatoryClass = (variant?.regulatory_class ?? 'unknown') as RegulatoryClass;

  signals.push({
    type: 'barcode_lookup',
    outcome: variant && referenceStatus === 'verified' ? 'match' : 'unavailable',
    source: 'db',
    evidence: variant
      ? { found: scan.gtin14, reference: variant.official_name ?? undefined, sourceUrl: variant.gtin_source?.url, sourceTitle: variant.gtin_source?.title ?? undefined, lastVerified: variant.gtin_source?.last_verified_at ?? undefined }
      : { found: scan.gtin14 },
  });

  // GS1 DataMatrix / GS1 QR may carry batch and dates.
  const gs1 = scan.gs1;
  const batch = gs1?.fields.batch;
  if (batch) readable.push('batch');
  if (gs1?.production) readable.push('manufacture_date');
  if (gs1?.expiry) readable.push('expiry_date');
  if (gs1?.production && gs1?.expiry) {
    const ok = gs1.expiry.iso > gs1.production.iso;
    signals.push({ type: 'dates_order', outcome: ok ? 'match' : 'mismatch', source: 'scanner',
      evidence: { found: `${gs1.production.raw} → ${gs1.expiry.raw}` } });
  }
  if (gs1?.expiry) {
    // month precision: expired only after the whole month has passed
    const expired = gs1.expiry.precision === 'month' ? gs1.expiry.iso < today.slice(0, 7) : gs1.expiry.iso < today;
    if (expired) signals.push({ type: 'expired', outcome: 'mismatch', source: 'scanner', evidence: { found: gs1.expiry.iso } });
  }
  if (batch) signals.push({ type: 'batch_present', outcome: 'match', source: 'scanner', evidence: { found: batch } });

  // Regulatory alerts
  const batchAlertsToCheck: LookupAlert[] = [];
  let alertChecked = false;
  for (const a of lookup?.alerts ?? []) {
    const ev = { found: scan.gtin14, reference: `${a.authority}: ${a.lot_text}`, sourceUrl: a.source_url, sourceTitle: a.authority, lastVerified: a.fetched_at?.slice(0, 10) ?? a.decision_date ?? undefined };
    if (a.lot_scope === 'all_batches') {
      signals.push({ type: 'alert_product_all_batches', outcome: 'mismatch', source: 'scanner', evidence: ev });
      continue;
    }
    if (a.lot_scope !== 'specific') continue;
    if (!batch) { batchAlertsToCheck.push(a); continue; }
    alertChecked = true;
    if (normalizeBatch(batch) !== normalizeBatch(a.lot_text)) continue;
    signals.push({
      type: 'alert_batch', outcome: 'mismatch', source: 'scanner', evidence: { ...ev, found: batch },
      alert: a.genuine_dates || a.counterfeit_dates
        ? compareAlertDates(a, gs1?.production?.iso, gs1?.expiry?.iso)
        : { alertKind: 'banned_batch', datesEqual: 'neither', datesReadable: false },
    });
  }
  if (batch && (alertChecked || (lookup?.alerts ?? []).length === 0)) signals.push({ type: 'alert_checked', outcome: 'match', source: 'db' });

  return { input: { referenceStatus, regulatoryClass, readable, signals }, variant, batchAlertsToCheck };
}

/** Batch numbers are compared exactly, ignoring only spaces and letter case (never O/0 or I/1 swaps). */
export const normalizeBatch = (s: string) => s.replace(/\s+/g, '').toUpperCase();

/** Alert dates are "MM.YYYY / MM.YYYY" (manufacture / expiry), month precision. */
function compareAlertDates(a: LookupAlert, mfg?: string, exp?: string): NonNullable<Signal['alert']> {
  const toIso = (raw?: string | null) => {
    const m = raw?.match(/^\s*(\d{2})\.(\d{4})\s*\/\s*(\d{2})\.(\d{4})\s*$/);
    return m ? [`${m[2]}-${m[1]}`, `${m[4]}-${m[3]}`] : null;
  };
  if (!mfg || !exp) return { alertKind: 'copied_genuine_batch', datesEqual: 'neither', datesReadable: false };
  const mine = [mfg.slice(0, 7), exp.slice(0, 7)];
  const same = (p: string[] | null) => !!p && p[0] === mine[0] && p[1] === mine[1];
  const datesEqual = same(toIso(a.counterfeit_dates)) ? 'counterfeit' : same(toIso(a.genuine_dates)) ? 'genuine' : 'neither';
  return { alertKind: 'copied_genuine_batch', datesEqual, datesReadable: true };
}
