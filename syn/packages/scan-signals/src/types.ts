/** Shapes returned by the public RPCs in supabase/migrations/20261109000500_public_lookup.sql. */
export interface LookupVariant {
  variant_id: string;
  product_id: string;
  external_ref: string;
  official_name: string | null;
  brand: string | null;
  market: string | null;
  verification_status: 'verified' | 'candidate_unverified' | 'retired';
  regulatory_class: 'cosmetic' | 'medical_device' | 'medicine' | 'unknown';
  category: string | null;
  package_text: string | null;
  concentration_text: string | null;
  gtin_source: { url: string; title: string | null; last_verified_at: string | null } | null;
}

export interface LookupAlert {
  authority: string;
  country: string | null;
  product_text: string;
  lot_text: string;
  lot_scope: 'specific' | 'all_batches' | 'not_on_pack' | 'unspecified';
  decision_date: string | null;
  reason_text_tr?: string | null;
  genuine_dates?: string | null;
  counterfeit_dates?: string | null;
  source_url: string;
  fetched_at?: string | null;
}

export interface LookupResult {
  gtin: string;
  variants: LookupVariant[];
  alerts: LookupAlert[];
}

export interface SearchHit {
  external_ref: string;
  official_name: string | null;
  brand: string | null;
  category_raw: string | null;
  verification_status: 'verified' | 'candidate_unverified' | 'retired';
  has_gtin: boolean;
}

export interface ReferenceRepo {
  readonly demo: boolean;
  lookupGtin(gtin14: string): Promise<LookupResult>;
  searchProducts(query: string): Promise<SearchHit[]>;
}

/** Structured reference values; present only when an official source gives them (never derived by us). */
export interface ReferenceStructured {
  gtin?: string | null;
  size_value?: number | null; size_unit?: string | null;
  concentration_value?: number | null; concentration_unit?: string | null;
  shelf_life_min_months?: number | null; shelf_life_max_months?: number | null;
  batch_regex?: string | null;
}
export type ReferenceVariant = LookupVariant & ReferenceStructured;
export interface Reference { variants: ReferenceVariant[]; alerts: LookupAlert[] }
