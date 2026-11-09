export type VerdictCode = 'mismatch' | 'suspect' | 'minor' | 'match' | 'insufficient';
export type Outcome = 'match' | 'mismatch' | 'unavailable';
export type Severity = 'critical' | 'major' | 'minor' | 'info' | 'none' | 'safety_flag';
export type Source = 'scanner' | 'ocr' | 'db' | 'user' | 'model';
export type ReferenceStatus = 'verified' | 'candidate_unverified' | 'not_found';
export type RegulatoryClass = 'cosmetic' | 'fragrance' | 'medical_device' | 'medicine' | 'unknown';

export interface Evidence {
  found?: string;          // what we read on the pack
  reference?: string;      // what the official reference says
  sourceTitle?: string;
  sourceUrl?: string;
  lastVerified?: string;
}

export interface Signal {
  type: string;
  outcome: Outcome;
  confidence?: number;     // 0..1, default 1
  source?: Source;
  userConfirmed?: boolean;
  severityOverride?: Severity;
  alert?: { alertKind: 'copied_genuine_batch' | 'fake_batch' | 'banned_batch' | 'unknown'; datesEqual: 'genuine' | 'counterfeit' | 'neither'; datesReadable: boolean };
  ingredients?: { activeChanged?: boolean; matchesOlderFormulaVersion?: boolean; nonActiveDiffCount?: number };
  evidence?: Evidence;
}

export interface ScanInput {
  referenceStatus: ReferenceStatus;
  regulatoryClass: RegulatoryClass;
  readable: string[];
  signals: Signal[];
  purchaseChannel?: 'authorized_agent' | 'pharmacy' | 'online_store' | 'social_media' | 'other';
}

export interface Reason {
  signal: Signal;
  severity: Severity | null;   // effective severity (after caps), null when not a mismatch
  ignored?: 'low_confidence' | 'needs_verified_reference';
  weight: number;
}

export type Annotation = 'social_media_caution' | 'medical_professional_only' | 'expired_banner'
  | 'match_is_not_authenticity' | 'confirm_ocr_reading' | 'experimental_signal';

export interface Verdict {
  verdict: VerdictCode;
  step: string;
  methodVersion: string;
  methodSha256: string;
  reasons: Reason[];            // sorted: mismatches by weight, then unavailable, then matches
  missing: string[];            // required items not matched (S7) or readable fields absent (S3)
  annotations: Annotation[];
}
