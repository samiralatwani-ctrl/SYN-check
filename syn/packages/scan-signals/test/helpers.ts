import type { LabelExtraction } from '@syn/label-extraction';

const text = (value: string | null, confidence = 0.97) => ({
  value, raw_text: value, confidence, unreadable_reason: value === null ? ('not_present' as const) : null, ambiguous_characters: [],
});
const date = (iso: string | null, confidence = 0.95) => ({
  value: iso ? { iso, precision: iso.length === 7 ? ('month' as const) : ('day' as const) } : null,
  raw_text: iso, confidence, unreadable_reason: iso === null ? ('not_present' as const) : null, format_ambiguous: false, marker_as_printed: null,
});
const none = { value: null, raw_text: null, confidence: 0, unreadable_reason: 'not_present' as const };

/** TEST_ label extraction builder (synthetic). */
export function label(p: { brand?: string | null; name?: string | null; batch?: string | null; batchConf?: number; mfg?: string | null; exp?: string | null }): LabelExtraction {
  return {
    schema_version: '1.0',
    image_quality: { usable: true, issues: [] },
    languages_detected: ['en'],
    fields: {
      brand_name: text(p.brand ?? null), product_name: text(p.name ?? null), size: none, concentration: none,
      manufacturer_name: text(null), manufacturer_address: text(null), batch: text(p.batch ?? null, p.batchConf),
      manufacture_date: date(p.mfg ?? null), expiry_date: date(p.exp ?? null), pao_months: none,
      barcode_digits: text(null), gs1_element_string: text(null),
    },
    ingredients: { status: 'not_visible', raw_text: null, items: [], list_truncated: false, confidence: 0 },
    registration_numbers: [],
  };
}
