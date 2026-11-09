// App flow with the TEST_ demo repository: label photo -> confirmation -> verdict, and barcode -> label.
import { beforeAll, describe, expect, it, vi } from 'vitest';

let session: typeof import('../src/scan/session');
beforeAll(async () => {
  vi.stubEnv('EXPO_PUBLIC_SYN_FIXTURES', '1');
  session = await import('../src/scan/session');
});
const photo = { base64: 'VEVTVF8=', mediaType: 'image/jpeg' as const };

describe('label flow (demo data)', () => {
  it('no verdict before the user confirms what was read', async () => {
    const s = await session.addLabel(null, photo);
    expect(s.verdict).toBeNull();
    expect(s.label?.extraction.fields.batch.ambiguous_characters.length).toBe(2);
  });

  it('confirming the ambiguous read as-is: batch does not match the alert, so no red', async () => {
    const s = await session.addLabel(null, photo);
    const f = s.label!.extraction.fields;
    await session.confirmLabel(s.id, { product_name: { value: f.product_name.value! }, batch: { value: f.batch.value! },
      manufacture_date: { value: '2025-02' }, expiry_date: { value: '2027-01' } });
    expect(s.identifiedBy).toBe('label_name');
    expect(s.verdict?.verdict).not.toBe('mismatch');
  });

  it('user corrects O->0 to the alerted batch with the counterfeit dates -> mismatch', async () => {
    const s = await session.addLabel(null, photo);
    await session.confirmLabel(s.id, { product_name: { value: 'TEST_ Filler ULTRA' }, batch: { value: 'TEST1005654957' },
      manufacture_date: { value: '2025-02' }, expiry_date: { value: '2027-01' } });
    expect(s.verdict?.verdict).toBe('mismatch');
    expect(s.verdict?.annotations).toContain('medical_professional_only');
  });

  it('a barcode-only verdict is upgraded by adding the label to the same session', async () => {
    const s = await session.startBarcode('ean13', '5901234123457');
    expect(s.verdict?.verdict).toBe('insufficient');
    await session.addLabel(s.id, photo);
    expect(s.barcode?.gtin14).toBe('05901234123457');   // same session keeps the barcode
  });
});
