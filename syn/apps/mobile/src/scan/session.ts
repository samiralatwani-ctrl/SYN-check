import { interpretScan, type ScannedCode, type Symbology } from '@syn/gs1';
import type { ExtractionResult } from '@syn/label-extraction';
import { evaluate, type Verdict } from '@syn/rules-engine';
import { buildScan, type LabelInput, type Reference, type ScanBuild } from '@syn/scan-signals';
import { repo } from '../data/repo';

/**
 * One check of one pack. It may start from a barcode or a label photo; the other can be added later.
 * Everything stays in memory on the device (history and sync come with accounts later).
 */
export interface ScanSession {
  id: string;
  createdAt: string;
  demo: boolean;
  barcode: ScannedCode | null;
  label: (ExtractionResult & { photoUri?: string }) | null;
  confirmed: LabelInput['confirmed'];
  labelConfirmed: boolean;
  reference: Reference | null;
  identifiedBy: 'barcode' | 'label_name' | null;
  nameMatches: number;            // products matching the label name (0, 1 or more)
  build: ScanBuild | null;
  verdict: Verdict | null;
  purchaseChannel: PurchaseChannel | null;
  reportId: string | null;
}

export type PurchaseChannel = 'authorized_agent' | 'pharmacy' | 'online_store' | 'social_media' | 'other';

const sessions = new Map<string, ScanSession>();
export const getSession = (id: string) => sessions.get(id);

const SYMBOLOGY: Record<string, Symbology> = {
  ean13: 'ean13', ean8: 'ean8', upc_a: 'upc_a', upc_e: 'upc_e', qr: 'qr', datamatrix: 'datamatrix',
  'org.gs1.EAN-13': 'ean13', 'org.gs1.EAN-8': 'ean8', 'org.gs1.UPC-E': 'upc_e', 'org.iso.QRCode': 'qr', 'org.iso.DataMatrix': 'datamatrix',
};
export const toSymbology = (t: string): Symbology => SYMBOLOGY[t] ?? 'unknown';

function newSession(): ScanSession {
  const now = new Date();
  const s: ScanSession = {
    id: `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: now.toISOString(), demo: repo.demo,
    barcode: null, label: null, confirmed: {}, labelConfirmed: false, reference: null, identifiedBy: null, nameMatches: 0, build: null, verdict: null, purchaseChannel: null, reportId: null,
  };
  sessions.set(s.id, s);
  return s;
}

function reevaluate(s: ScanSession) {
  s.build = buildScan({
    barcode: s.barcode, reference: s.reference, identifiedBy: s.identifiedBy, today: new Date().toISOString().slice(0, 10),
    label: s.label && s.labelConfirmed ? { extraction: s.label.extraction, confirmed: s.confirmed } : null,
  });
  s.verdict = evaluate({ ...s.build.input, purchaseChannel: s.purchaseChannel ?? undefined });
}

/** Optional question (§5.6). Social media adds a caution note; the verdict itself does not change (D-011). */
export function setPurchaseChannel(id: string, channel: PurchaseChannel | null) {
  const s = sessions.get(id);
  if (!s?.build) return;
  s.purchaseChannel = channel;
  reevaluate(s);
}

export async function startBarcode(symbology: Symbology, data: string): Promise<ScanSession> {
  const s = newSession();
  s.barcode = interpretScan(symbology, data, new Date());
  if (s.barcode.gtin14) {
    const lookup = await repo.lookupGtin(s.barcode.gtin14);
    s.reference = lookup;
    s.identifiedBy = 'barcode';
  }
  reevaluate(s);
  return s;
}

/** Reads the label on the server; the verdict waits until the user confirms what was read. */
export async function addLabel(sessionId: string | null, photo: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; uri?: string }) {
  const s = (sessionId && sessions.get(sessionId)) || newSession();
  const result = await repo.extractLabel(photo.base64, photo.mediaType);
  s.label = { ...result, photoUri: photo.uri };
  s.labelConfirmed = false;
  s.confirmed = {};
  return s;
}

/** Called from the confirmation screen with the values the user checked (or corrected). */
export async function confirmLabel(sessionId: string, confirmed: LabelInput['confirmed']) {
  const s = sessions.get(sessionId)!;
  s.confirmed = confirmed;
  s.labelConfirmed = true;
  if (s.identifiedBy !== 'barcode') {
    const f = s.label!.extraction.fields;
    const name = confirmed.product_name?.value ?? f.product_name.value;
    const matches = name ? await repo.resolveProductName(f.brand_name.value, name) : [];
    s.nameMatches = matches.length;
    // Only an unambiguous exact name match identifies the product; otherwise we do not pick one for the user.
    if (matches.length === 1) {
      s.reference = await repo.productReference(matches[0].external_ref);
      s.identifiedBy = 'label_name';
    } else {
      s.reference = null;
      s.identifiedBy = null;
    }
  }
  reevaluate(s);
  return s;
}
