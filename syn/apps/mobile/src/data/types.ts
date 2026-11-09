import type { ExtractionResult } from '@syn/label-extraction';
import type { LookupResult, Reference, SearchHit } from '@syn/scan-signals';

export type { LookupAlert, LookupResult, LookupVariant, Reference, SearchHit } from '@syn/scan-signals';

export interface NameMatch { external_ref: string; official_name: string; verification_status: string }

export interface ReferenceRepo {
  readonly demo: boolean;
  lookupGtin(gtin14: string): Promise<LookupResult>;
  searchProducts(query: string): Promise<SearchHit[]>;
  resolveProductName(brand: string | null, name: string): Promise<NameMatch[]>;
  productReference(externalRef: string): Promise<Reference>;
  /** Server-side label reading (the vision API key never reaches the app). */
  extractLabel(imageBase64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<ExtractionResult>;
}
