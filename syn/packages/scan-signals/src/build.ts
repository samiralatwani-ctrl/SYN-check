import type { ScannedCode } from '@syn/gs1';
import { compareLists, parseIngredientList } from '@syn/inci';
import { MIN_CONFIDENCE, readableValue, type LabelExtraction } from '@syn/label-extraction';
import type { Evidence, RegulatoryClass, ReferenceStatus, ScanInput, Signal, Source } from '@syn/rules-engine';
import type { FormulaVersion, LookupAlert, Reference, ReferenceVariant } from './types';

/**
 * Builds rules-engine input from whatever the user scanned: a barcode, a label photo, or both.
 * Pure and deterministic (`today` is passed in). Never fills a gap with a guess: a value that is not read
 * with enough confidence (or confirmed by the user) does not produce a signal.
 */

export type ConfirmableField = 'product_name' | 'batch' | 'manufacture_date' | 'expiry_date';

export interface LabelInput {
  extraction: LabelExtraction;
  /** Fields the user checked on the confirmation screen. An edited value replaces the read one. */
  confirmed: Partial<Record<ConfirmableField, { value: string }>>;
}

export interface ScanBuildInput {
  barcode?: ScannedCode | null;
  label?: LabelInput | null;
  reference: Reference | null;
  /** How the product was identified: by a scanned GTIN, by an exact name match on the label, or not at all. */
  identifiedBy: 'barcode' | 'label_name' | null;
  today: string; // YYYY-MM-DD
}

export interface ScanBuild {
  input: ScanInput;
  variant: ReferenceVariant | null;
  /** Batch-specific alerts that could not be compared because no batch was read. */
  batchAlertsToCheck: LookupAlert[];
  /** What we read and used, for display and the audit trail. */
  used: { batch?: string; manufacture?: string; expiry?: string; productName?: string };
}

interface Valued { value: string; source: Source; confirmed: boolean }

const rank = (s: string) => (s === 'verified' ? 0 : s === 'candidate_unverified' ? 1 : 2);
export const normalizeBatch = (s: string) => s.replace(/\s+/g, '').toUpperCase();
export const nameKey = (s: string) =>
  s.replace(/[®™©]/g, '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function buildScan(b: ScanBuildInput): ScanBuild {
  const signals: Signal[] = [];
  const readable = new Set<string>();
  const used: ScanBuild['used'] = {};
  const variants = [...(b.reference?.variants ?? [])].sort((x, y) => rank(x.verification_status) - rank(y.verification_status));
  const variant = b.identifiedBy ? variants[0] ?? null : null;
  const referenceStatus: ReferenceStatus = variant ? (variant.verification_status === 'retired' ? 'not_found' : variant.verification_status) : 'not_found';
  const regulatoryClass = (variant?.regulatory_class ?? 'unknown') as RegulatoryClass;
  const gtinEvidence = (found: string): Evidence => ({
    found, reference: variant?.official_name ?? undefined, sourceUrl: variant?.gtin_source?.url,
    sourceTitle: variant?.gtin_source?.title ?? undefined, lastVerified: variant?.gtin_source?.last_verified_at ?? undefined,
  });

  // ---------------------------------------------------------------- barcode
  const scan = b.barcode;
  if (scan) {
    if (!scan.checkDigitValid || !scan.gtin14) {
      signals.push({ type: 'barcode_checksum', outcome: 'unavailable', source: 'scanner', evidence: { found: scan.raw } });
    } else {
      signals.push({ type: 'barcode_checksum', outcome: 'match', source: 'scanner', evidence: { found: scan.gtin14 } });
      readable.add('gtin');
      signals.push({ type: 'barcode_lookup', outcome: variant && referenceStatus === 'verified' && b.identifiedBy === 'barcode' ? 'match' : 'unavailable',
        source: 'db', evidence: gtinEvidence(scan.gtin14) });
    }
  }

  // ---------------------------------------------------------------- values from DataMatrix and label
  const gs1 = scan?.gs1;
  const fromLabel = (field: ConfirmableField, read: string | null): Valued | null => {
    const c = b.label?.confirmed[field];
    if (c && c.value.trim()) return { value: c.value.trim(), source: c.value.trim() === read ? 'ocr' : 'user', confirmed: true };
    return read ? { value: read, source: 'ocr', confirmed: false } : null;
  };
  const f = b.label?.extraction.fields;
  const dateRead = (d?: LabelExtraction['fields']['expiry_date']) => (d ? readableValue(d)?.iso ?? null : null);

  // Scanner-encoded values (DataMatrix) are machine-read and need no confirmation.
  const batch: Valued | null = gs1?.fields.batch ? { value: gs1.fields.batch, source: 'scanner', confirmed: true }
    : fromLabel('batch', f ? readableValue(f.batch) : null);
  const mfg: Valued | null = gs1?.production ? { value: gs1.production.iso, source: 'scanner', confirmed: true }
    : fromLabel('manufacture_date', dateRead(f?.manufacture_date));
  const exp: Valued | null = gs1?.expiry ? { value: gs1.expiry.iso, source: 'scanner', confirmed: true }
    : fromLabel('expiry_date', dateRead(f?.expiry_date));

  if (batch) { readable.add('batch'); used.batch = batch.value; signals.push(sig('batch_present', 'match', batch, { found: batch.value })); }
  if (mfg) { readable.add('manufacture_date'); used.manufacture = mfg.value; }
  if (exp) { readable.add('expiry_date'); used.expiry = exp.value; }

  // DataMatrix vs printed text on the same pack
  if (gs1?.fields.batch && f) {
    const printed = readableValue(f.batch);
    if (printed) signals.push({ type: 'gs1_vs_printed', outcome: normalizeBatch(printed) === normalizeBatch(gs1.fields.batch) ? 'match' : 'mismatch',
      source: 'ocr', evidence: { found: printed, reference: gs1.fields.batch } });
  }

  // ---------------------------------------------------------------- label identity fields
  if (f) {
    const brand = readableValue(f.brand_name);
    const name = fromLabel('product_name', readableValue(f.product_name));
    if (name) {
      readable.add('product_name');
      used.productName = [brand, name.value].filter(Boolean).join(' ');
      if (variant?.official_name) {
        const official = nameKey(variant.official_name);
        const read = [nameKey(name.value), nameKey(`${brand ?? ''} ${name.value}`)];
        const ok = b.identifiedBy === 'label_name' || read.some((r) => r === official || official.includes(r) || r.includes(official));
        signals.push(sig('product_name', ok ? 'match' : 'mismatch', name, { found: used.productName, reference: variant.official_name }));
      }
    }
    compareQuantity('size', readableValue(f.size), variant?.size_value, variant?.size_unit, signals, readable);
    compareQuantity('concentration', readableValue(f.concentration), variant?.concentration_value, variant?.concentration_unit, signals, readable);
    const ing = b.label!.extraction.ingredients;
    if (ing.status === 'read' && ing.confidence >= MIN_CONFIDENCE && !ing.list_truncated) {
      readable.add('ingredients');
      if (variant) signals.push(...ingredientSignals(ing, variant));
    }
  }

  // ---------------------------------------------------------------- dates
  if (mfg && exp) {
    const order = compareDates(exp.value, mfg.value);
    const ok = order === 'later';
    signals.push(sig('dates_order', order === 'undecidable' ? 'unavailable' : ok ? 'match' : 'mismatch', both(mfg, exp),
      { found: `${mfg.value} → ${exp.value}` }));
    const min = variant?.shelf_life_min_months, max = variant?.shelf_life_max_months;
    if (ok && min != null && max != null) {
      const months = monthsBetween(mfg.value, exp.value);
      signals.push(sig('shelf_life_range', months >= min && months <= max ? 'match' : 'mismatch', both(mfg, exp),
        { found: `${months}`, reference: `${min}–${max}` }));
    }
  }
  if (exp && isPast(exp.value, b.today)) signals.push(sig('expired', 'mismatch', exp, { found: exp.value }));

  // ---------------------------------------------------------------- batch format
  if (batch && variant?.batch_regex) {
    let ok = true;
    try { ok = new RegExp(variant.batch_regex).test(batch.value); } catch { ok = true; }
    signals.push(sig('batch_format', ok ? 'match' : 'mismatch', batch, { found: batch.value, reference: variant.batch_regex }));
  }

  // ---------------------------------------------------------------- regulatory alerts
  const batchAlertsToCheck: LookupAlert[] = [];
  let compared = false;
  const alerts = b.reference?.alerts ?? [];
  for (const a of alerts) {
    const ev: Evidence = { reference: `${a.authority}: ${a.lot_text}`, sourceUrl: a.source_url, sourceTitle: a.authority,
      lastVerified: a.fetched_at?.slice(0, 10) ?? a.decision_date ?? undefined };
    if (a.lot_scope === 'all_batches') {
      // Applies to the product identified by GTIN. Identified by name only -> the GTIN was not checked.
      const viaBarcode = b.identifiedBy === 'barcode' && !!scan?.gtin14;
      signals.push({ type: 'alert_product_all_batches', outcome: 'mismatch', source: viaBarcode ? 'scanner' : 'ocr',
        userConfirmed: viaBarcode ? undefined : !!b.label?.confirmed.product_name, evidence: { ...ev, found: scan?.gtin14 ?? used.productName } });
      continue;
    }
    if (a.lot_scope !== 'specific') continue;
    if (!batch) { batchAlertsToCheck.push(a); continue; }
    compared = true;
    if (normalizeBatch(batch.value) !== normalizeBatch(a.lot_text)) continue;
    const dated = !!(a.genuine_dates || a.counterfeit_dates);
    const involved = dated ? [batch, mfg, exp].filter((v): v is Valued => !!v) : [batch];
    signals.push({ ...sig('alert_batch', 'mismatch', both(...involved), { ...ev, found: [batch.value, mfg?.value, exp?.value].filter(Boolean).join(' · ') }),
      alert: dated ? compareAlertDates(a, mfg?.value, exp?.value) : { alertKind: 'banned_batch', datesEqual: 'neither', datesReadable: false } });
  }
  if (batch && (compared || alerts.length === 0) && b.identifiedBy) signals.push({ type: 'alert_checked', outcome: 'match', source: 'db' });

  return { input: { referenceStatus, regulatoryClass, readable: [...readable], signals }, variant, batchAlertsToCheck, used };
}

// ---------------------------------------------------------------- helpers
function sig(type: string, outcome: Signal['outcome'], v: Valued, evidence: Evidence): Signal {
  return { type, outcome, source: v.source, userConfirmed: v.source === 'scanner' ? undefined : v.confirmed, evidence };
}

/** Combined provenance: machine-read only if all are; confirmed only if all are. */
function both(...vs: Valued[]): Valued {
  const source: Source = vs.every((v) => v.source === 'scanner') ? 'scanner' : vs.some((v) => v.source === 'ocr') ? 'ocr' : 'user';
  return { value: '', source, confirmed: vs.every((v) => v.confirmed) };
}

/**
 * Compares at the coarser precision of the two. Same month with one date at month precision cannot be
 * decided (an expiry "2025-02" may be the end of February), so it is never reported as impossible.
 */
function compareDates(a: string, b: string): 'later' | 'not_later' | 'undecidable' {
  const n = Math.min(a.length, b.length);
  const x = a.slice(0, n), y = b.slice(0, n);
  if (x === y && a.length !== b.length) return 'undecidable';
  return x > y ? 'later' : 'not_later';
}
function isPast(exp: string, today: string) {
  return exp.length === 7 ? exp < today.slice(0, 7) : exp < today;
}
function monthsBetween(a: string, b: string) {
  const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

function compareQuantity(type: 'size' | 'concentration', read: { amount: number; unit: string } | null,
  refValue: number | null | undefined, refUnit: string | null | undefined, signals: Signal[], readable: Set<string>) {
  if (!read) return;
  readable.add(type);
  if (refValue == null || !refUnit) return;   // no structured official value -> nothing to compare
  const same = read.unit === refUnit && Math.abs(read.amount - refValue) < 1e-9;
  signals.push({ type, outcome: same ? 'match' : 'mismatch', source: 'ocr', evidence: { found: `${read.amount} ${read.unit}`, reference: `${refValue} ${refUnit}` } });
}

/** Alert dates are "MM.YYYY / MM.YYYY" (manufacture / expiry), month precision. */
function compareAlertDates(a: LookupAlert, mfg?: string, exp?: string): NonNullable<Signal['alert']> {
  const toMonths = (raw?: string | null) => {
    const m = raw?.match(/^\s*(\d{2})\.(\d{4})\s*\/\s*(\d{2})\.(\d{4})\s*$/);
    return m ? [`${m[2]}-${m[1]}`, `${m[4]}-${m[3]}`] : null;
  };
  if (!mfg || !exp) return { alertKind: 'copied_genuine_batch', datesEqual: 'neither', datesReadable: false };
  const mine = [mfg.slice(0, 7), exp.slice(0, 7)];
  const same = (p: string[] | null) => !!p && p[0] === mine[0] && p[1] === mine[1];
  const datesEqual = same(toMonths(a.counterfeit_dates)) ? 'counterfeit' : same(toMonths(a.genuine_dates)) ? 'genuine' : 'neither';
  return { alertKind: 'copied_genuine_batch', datesEqual, datesReadable: true };
}

/**
 * Ingredient comparison against the newest approved official list of the same variant (CLAUDE.md §5.4).
 * Order-only -> minor; content matching an older official version -> minor (reformulation);
 * other content changes -> by rule (active substance -> critical). Perfumes: ingredients weigh less (§8).
 */
function ingredientSignals(ing: LabelExtraction['ingredients'], variant: ReferenceVariant): Signal[] {
  const versions = variant.formula_versions ?? [];
  if (!versions.length) return [];
  const readList = ing.raw_text ? parseIngredientList(ing.raw_text).items
    : [...ing.items].sort((a, b) => a.position - b.position).map((i) => i.name_as_printed);
  if (readList.length < 2) return [];
  const list = (v: FormulaVersion) => [...v.ingredients].sort((a, b) => a.position - b.position).map((i) => i.inci_name);
  const actives = (v: FormulaVersion) => new Set(v.ingredients.filter((i) => i.is_active).map((i) => i.inci_name));
  const [latest, ...older] = versions;
  const c = compareLists(readList, list(latest), actives(latest));
  const ev: Evidence = { found: readList.join(', '), reference: list(latest).join(', '), sourceUrl: latest.source_url,
    sourceTitle: latest.source_title ?? undefined, lastVerified: latest.source_date ?? undefined };
  const fragrance = variant.category === 'fragrance';
  const out: Signal[] = [];
  if (c.sameSet) {
    out.push({ type: 'ingredients_content', outcome: 'match', source: 'ocr', evidence: ev });
    out.push({ type: 'ingredients_order', outcome: c.sameOrder ? 'match' : 'mismatch', source: 'ocr',
      evidence: { ...ev, found: c.sameOrder ? ev.found : `${c.moved.join(', ')}` } });
    return out;
  }
  const older_ = older.find((v) => compareLists(readList, list(v), actives(v)).sameSet);
  out.push({
    type: 'ingredients_content', outcome: 'mismatch', source: 'ocr',
    severityOverride: fragrance && !c.activeChanged ? 'minor' : undefined,
    // A list identical to an older official version is a legitimate reformulation, whatever changed since.
    ingredients: { activeChanged: !older_ && c.activeChanged, matchesOlderFormulaVersion: !!older_, nonActiveDiffCount: c.nonActiveDiffCount },
    evidence: { ...ev, found: [c.added.length ? `+ ${c.added.join(', ')}` : '', c.removed.length ? `− ${c.removed.join(', ')}` : ''].filter(Boolean).join(' · '),
      ...(older_ ? { reference: list(older_).join(', '), sourceUrl: older_.source_url, lastVerified: older_.source_date ?? undefined } : {}) },
  });
  return out;
}
