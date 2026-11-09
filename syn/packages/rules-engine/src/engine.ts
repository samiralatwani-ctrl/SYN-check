import method from './method-v1.json';
import type { Annotation, Reason, ScanInput, Severity, Signal, Verdict } from './types';

type SignalDef = { severity: string; needs_verified_ref: boolean; weight: number; weight_medical?: number; experimental?: boolean };
type Method = typeof method & { signals: Record<string, SignalDef> };
const M = method as unknown as Method;

const MEDICAL = new Set(['medical_device', 'medicine']);
const RANK: Record<string, number> = { critical: 0, major: 1, minor: 2 };

function alertSeverity(s: Signal): Severity {
  const a = s.alert;
  if (!a) return 'major';
  if (a.alertKind === 'fake_batch' || a.alertKind === 'banned_batch' || a.datesEqual === 'counterfeit') return 'critical';
  if (a.datesEqual === 'neither' && a.datesReadable) return 'critical';
  return 'major';
}

function ingredientsSeverity(s: Signal): Severity {
  const i = s.ingredients ?? {};
  if (i.activeChanged) return 'critical';
  if (i.matchesOlderFormulaVersion) return 'minor';
  if ((i.nonActiveDiffCount ?? 0) <= M.thresholds.ingredients_minor_max_diff) return 'minor';
  return 'major';
}

function effectiveSeverity(s: Signal, def: SignalDef): Severity {
  let sev = (s.severityOverride ?? def.severity) as Severity | 'by_rule';
  if (sev === 'by_rule') sev = s.type === 'alert_batch' ? alertSeverity(s) : ingredientsSeverity(s);
  if (def.experimental && (sev === 'critical' || sev === 'major')) sev = 'minor';   // S0: experimental capped
  return sev;
}

/** Deterministic: same input + same method => same verdict. No I/O, no clock. */
export function evaluate(input: ScanInput): Verdict {
  const medical = MEDICAL.has(input.regulatoryClass);
  const reasons: Reason[] = [];
  const annotations = new Set<Annotation>();

  for (const raw of input.signals) {
    const def = M.signals[raw.type];
    if (!def) throw new Error(`unknown signal type: ${raw.type}`);
    const s: Signal = { confidence: 1, source: 'db', userConfirmed: false, ...raw };
    const weight = medical && def.weight_medical != null ? def.weight_medical : def.weight;
    if ((s.confidence ?? 1) < M.thresholds.min_confidence) {                       // S0
      reasons.push({ signal: { ...s, outcome: 'unavailable' }, severity: null, ignored: 'low_confidence', weight });
      continue;
    }
    if (def.needs_verified_ref && input.referenceStatus !== 'verified') {             // S0
      reasons.push({ signal: s, severity: null, ignored: 'needs_verified_reference', weight });
      continue;
    }
    const severity = s.outcome === 'mismatch' ? effectiveSeverity(s, def) : null;
    if (def.experimental) annotations.add('experimental_signal');
    if (s.type === 'expired' && s.outcome === 'mismatch') annotations.add('expired_banner');
    reasons.push({ signal: s, severity, weight });
  }

  if (input.purchaseChannel === 'social_media') annotations.add('social_media_caution');
  if (medical) annotations.add('medical_professional_only');

  const active = reasons.filter((r) => !r.ignored);
  const withSev = (sev: string) => active.filter((r) => r.severity === sev);
  const done = (verdict: Verdict['verdict'], step: string, missing: string[] = []): Verdict => {
    if (verdict === 'match') annotations.add('match_is_not_authenticity');
    return {
      verdict, step, missing, methodVersion: M.version, methodSha256: (M as unknown as { rules_sha256: string }).rules_sha256,
      annotations: [...annotations], reasons: sortReasons(reasons),
    };
  };

  // S1 critical
  const crit = withSev('critical');
  if (crit.length) {
    const allUnconfirmedOcr = crit.every((r) => r.signal.source === 'ocr' && !r.signal.userConfirmed);
    if (allUnconfirmedOcr) { annotations.add('confirm_ocr_reading'); return done('suspect', 'S1_critical'); }
    return done('mismatch', 'S1_critical');
  }
  // S2 reference gate
  if (input.referenceStatus !== 'verified') return done('insufficient', 'S2_no_reference');
  // S3 too little read
  if (input.readable.length < M.thresholds.min_readable_fields) {
    const absent = (M.readable_fields as string[]).filter((f) => !input.readable.includes(f));
    return done('insufficient', 'S3_too_little_read', absent);
  }
  if (withSev('major').length) return done('suspect', 'S4_major');
  if (withSev('minor').length) return done('minor', 'S5_minor');
  // S6 required matches
  const cls = input.regulatoryClass === 'unknown' ? 'cosmetic' : input.regulatoryClass;
  const required = (M.required_for_match as Record<string, string[]>)[cls] ?? [];
  const matched = new Set(active.filter((r) => r.signal.outcome === 'match').map((r) => r.signal.type));
  const missing = required.filter((t) => !matched.has(t));
  if (!missing.length) return done('match', 'S6_match');
  return done('insufficient', 'S7_default', missing);
}

function sortReasons(rs: Reason[]): Reason[] {
  const key = (r: Reason) =>
    r.signal.outcome === 'mismatch' && !r.ignored ? RANK[r.severity ?? ''] ?? 3 : r.signal.outcome === 'unavailable' || r.ignored ? 4 : 5;
  return [...rs].sort((a, b) => key(a) - key(b) || b.weight - a.weight);
}

export const METHOD_VERSION = M.version;
/** Numeric thresholds of the active method (used by signal builders, e.g. the experimental visual signal). */
export const METHOD_THRESHOLDS = M.thresholds as unknown as Record<string, number>;
