import { interpretScan, type Symbology } from '@syn/gs1';
import { evaluate, type Verdict } from '@syn/rules-engine';
import { repo } from '../data/repo';
import type { LookupAlert, LookupVariant } from '../data/types';
import { buildBarcodeScan } from './buildSignals';

export interface ScanRecord {
  id: string;
  createdAt: string;
  symbology: Symbology;
  raw: string;
  gtin14: string | null;
  verdict: Verdict;
  variant: LookupVariant | null;
  batchAlertsToCheck: LookupAlert[];
  demo: boolean;
}

const records = new Map<string, ScanRecord>();
export const getScan = (id: string) => records.get(id);

const SYMBOLOGY: Record<string, Symbology> = {
  ean13: 'ean13', ean8: 'ean8', upc_a: 'upc_a', upc_e: 'upc_e', qr: 'qr', datamatrix: 'datamatrix',
  'org.gs1.EAN-13': 'ean13', 'org.gs1.EAN-8': 'ean8', 'org.gs1.UPC-E': 'upc_e', 'org.iso.QRCode': 'qr', 'org.iso.DataMatrix': 'datamatrix',
};
export const toSymbology = (t: string): Symbology => SYMBOLOGY[t] ?? 'unknown';

export async function runBarcodeScan(symbology: Symbology, data: string): Promise<ScanRecord> {
  const now = new Date();
  const scan = interpretScan(symbology, data, now);
  const lookup = scan.gtin14 ? await repo.lookupGtin(scan.gtin14) : null;
  const ctx = buildBarcodeScan(scan, lookup, now.toISOString().slice(0, 10));
  const rec: ScanRecord = {
    id: `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now.toISOString(), symbology, raw: data, gtin14: scan.gtin14,
    verdict: evaluate(ctx.input), variant: ctx.variant, batchAlertsToCheck: ctx.batchAlertsToCheck, demo: repo.demo,
  };
  records.set(rec.id, rec);
  return rec;
}
