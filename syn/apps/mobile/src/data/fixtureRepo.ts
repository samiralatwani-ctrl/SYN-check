import type { ExtractionResult, LabelExtraction } from '@syn/label-extraction';
import type { LookupResult, NameMatch, Reference, ReferenceRepo, SearchHit } from './types';

/**
 * Demo mode only (EXPO_PUBLIC_SYN_FIXTURES=1). Every value here is a TEST_ fixture, never real product data,
 * and the app shows a visible "demo data" banner while this repo is active.
 * Barcodes are syntactically valid GTINs chosen for the demo; they are not claimed to belong to any product.
 */
export const FIXTURE_GTINS = {
  notInDb: '05901234123457',            // valid check digit, unknown product -> insufficient (phase-2 acceptance)
  verifiedBarcodeOnly: '04006381333931', // TEST_ verified product, barcode only -> insufficient, "scan the label"
  allBatchesAlert: '00036000291452',    // TEST_ alert covering all batches -> mismatch
} as const;

const TEST_VARIANT = {
  variant_id: 'TEST_variant', product_id: 'TEST_product', external_ref: 'TEST_IQB-9001',
  official_name: 'TEST_ Verified Cream 50 ml', brand: 'TEST_BRAND', market: null,
  verification_status: 'verified' as const, regulatory_class: 'cosmetic' as const, category: null,
  package_text: 'TEST_ 50 ml tube', concentration_text: null,
  gtin_source: { url: 'https://example.test/official', title: 'TEST_ official source', last_verified_at: '2026-11-09' },
};

/** TEST_ filler with a TEST_ alert whose batch was copied (genuine 01.2023/12.2024, counterfeit 02.2025/01.2027). */
const TEST_FILLER_REF: Reference = {
  variants: [{ ...TEST_VARIANT, variant_id: 'TEST_filler', external_ref: 'TEST_IQB-9002', official_name: 'TEST_ Filler ULTRA',
    brand: 'TEST_BRAND', regulatory_class: 'medical_device', gtin_source: null }],
  alerts: [{ authority: 'TEST_AUTHORITY', country: 'AT', product_text: 'TEST_ Filler ULTRA', lot_text: 'TEST1005654957', lot_scope: 'specific',
    decision_date: '2026-05-27', genuine_dates: '01.2023 / 12.2024', counterfeit_dates: '02.2025 / 01.2027', source_url: 'https://example.test/alert' }],
};
const t = (value: string | null, confidence = 0.96) => ({ value, raw_text: value, confidence, unreadable_reason: value ? null : ('not_present' as const), ambiguous_characters: [] });
const d = (iso: string) => ({ value: { iso, precision: 'month' as const }, raw_text: iso, confidence: 0.93, unreadable_reason: null, format_ambiguous: false, marker_as_printed: null });
const none = { value: null, raw_text: null, confidence: 0, unreadable_reason: 'not_present' as const };
/** What the demo "label photo" reads as: the TEST_ filler with the alerted batch and the counterfeit dates. */
const TEST_LABEL: LabelExtraction = {
  schema_version: '1.0', image_quality: { usable: true, issues: [] }, languages_detected: ['en'],
  fields: { brand_name: t('TEST_BRAND'), product_name: t('TEST_ Filler ULTRA'), size: none, concentration: none, manufacturer_name: t(null),
    manufacturer_address: t(null), batch: { ...t('TEST1OO5654957', 0.9), ambiguous_characters: [{ index: 5, candidates: ['O', '0'] }, { index: 6, candidates: ['O', '0'] }] },
    manufacture_date: d('2025-02'), expiry_date: d('2027-01'), pao_months: none, barcode_digits: t(null), gs1_element_string: t(null) },
  ingredients: { status: 'not_visible', raw_text: null, items: [], list_truncated: false, confidence: 0 }, registration_numbers: [],
};

export const fixtureRepo: ReferenceRepo = {
  demo: true,
  async resolveProductName(brand, name): Promise<NameMatch[]> {
    const key = `${brand ?? ''} ${name}`.toLowerCase();
    return key.includes('test_ filler ultra') ? [{ external_ref: 'TEST_IQB-9002', official_name: 'TEST_ Filler ULTRA', verification_status: 'verified' }] : [];
  },
  async productReference(ref): Promise<Reference> {
    return ref === 'TEST_IQB-9002' ? TEST_FILLER_REF : { variants: [], alerts: [] };
  },
  async extractLabel(): Promise<ExtractionResult> {
    return { extraction: TEST_LABEL, corrections: [],
      meta: { engine: 'server_vision', model: 'TEST_fixture', served_by: 'TEST_fixture', prompt_version: 'label-v1', extracted_at: new Date().toISOString() } };
  },
  async lookupGtin(gtin14): Promise<LookupResult> {
    if (gtin14 === FIXTURE_GTINS.verifiedBarcodeOnly) return { gtin: gtin14, variants: [TEST_VARIANT], alerts: [] };
    if (gtin14 === FIXTURE_GTINS.allBatchesAlert)
      return {
        gtin: gtin14, variants: [],
        alerts: [{ authority: 'TEST_AUTHORITY', country: 'TR', product_text: 'TEST_ Banned Gel', lot_text: 'Tüm seriler',
          lot_scope: 'all_batches', decision_date: '2026-10-01', reason_text_tr: 'TEST_ gerekçe',
          source_url: 'https://example.test/alert', fetched_at: '2026-11-09T00:00:00Z' }],
      };
    return { gtin: gtin14, variants: [], alerts: [] };
  },
  async searchProducts(query): Promise<SearchHit[]> {
    return query.trim().length >= 2 && 'test_ verified cream'.includes(query.trim().toLowerCase())
      ? [{ external_ref: 'TEST_IQB-9001', official_name: TEST_VARIANT.official_name, brand: 'TEST_BRAND', category_raw: null,
           verification_status: 'verified', has_gtin: true }]
      : [];
  },
};
