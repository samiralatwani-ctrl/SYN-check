import type { ExtractionResult } from '@syn/label-extraction';
import type { LookupResult, Reference, SearchHit } from '@syn/scan-signals';

export type { LookupAlert, LookupResult, LookupVariant, Reference, SearchHit } from '@syn/scan-signals';

export interface ReportContacts {
  brand: { name: string; contact_text: string | null; report_email: string | null; anti_counterfeit_page: string | null;
    official_verification_method: string | null; emails: string[];
    agents: { country: string | null; region: string | null; availability: string; text: string }[] } | null;
  authorities: { country: string; authority: string; kind: 'email' | 'phone' | 'web' | 'whatsapp'; value: string; purpose: string | null;
    source_url: string; last_verified_at: string }[];
}
export interface ExploreData {
  alerts: (import('@syn/scan-signals').LookupAlert & { reason_text_tr?: string | null })[];
  agents: { brand: string; country: string | null; country_name: string | null; region: string | null; availability: string; text: string; sources: string[] | null }[];
  verified: { external_ref: string; official_name: string; brand: string | null; category: string | null; regulatory_class: string | null }[];
}
export interface SavedReport { scanId: string; reportId: string }
export interface SaveReportInput {
  scan: { verdict: string; methodVersion: string; methodSha256: string; variantId: string | null; productId: string | null;
    extraction: unknown; purchaseChannel: string | null; signals: { type: string; outcome: string; severity: string | null; weight: number; confidence: number | null; evidence: unknown }[] };
  report: { recipients: string[]; channel: 'email' | 'whatsapp'; messageText: string; attachmentsCount: number; sellerInfoPrivate: string | null; purchaseChannel: string | null };
}

export interface NameMatch { external_ref: string; official_name: string; verification_status: string }

export interface ReferenceRepo {
  readonly demo: boolean;
  lookupGtin(gtin14: string): Promise<LookupResult>;
  searchProducts(query: string): Promise<SearchHit[]>;
  resolveProductName(brand: string | null, name: string): Promise<NameMatch[]>;
  productReference(externalRef: string): Promise<Reference>;
  reportContacts(externalRef: string | null): Promise<ReportContacts>;
  explore(): Promise<ExploreData>;
  /** Stores the scan and the report (signed-in or anonymous user; RLS limits rows to their owner). */
  saveReport(input: SaveReportInput): Promise<SavedReport>;
  /** Server-side label reading (the vision API key never reaches the app). */
  extractLabel(imageBase64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<ExtractionResult>;
}
