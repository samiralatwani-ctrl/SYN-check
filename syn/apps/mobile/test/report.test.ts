// Phase-5 acceptance: the ready message contains the photos and the batch, and never names the seller.
import { evaluate } from '@syn/rules-engine';
import { describe, expect, it } from 'vitest';
import { buildReportMessage, type ReportInput } from '../src/report/message';

const verdict = evaluate({ referenceStatus: 'verified', regulatoryClass: 'medical_device', readable: ['product_name', 'batch'],
  signals: [{ type: 'alert_batch', outcome: 'mismatch', source: 'user', userConfirmed: true,
    alert: { alertKind: 'copied_genuine_batch', datesEqual: 'counterfeit', datesReadable: true } }] });
const base: ReportInput = {
  lang: 'ar', productName: 'TEST_ Filler ULTRA', brand: 'TEST_BRAND', gtin14: null,
  used: { batch: 'TEST1005654957', manufacture: '2025-02', expiry: '2027-01' }, verdict,
  reasonTexts: ['رقم التشغيلة مذكور في إنذار رقابي'], purchaseChannel: 'حساب تواصل اجتماعي', country: 'العراق',
  photoUris: ['file:///TEST_label.jpg'], createdAt: '2026-11-09T12:00:00Z', appName: 'SYN',
};

describe('phase 5 acceptance', () => {
  it('message has the photos and the batch number, and no seller', () => {
    const m = buildReportMessage({ ...base, ...({ seller: 'TEST_SELLER_SHOP', sellerName: 'TEST_SELLER_SHOP' } as object) }, 'غير مطابق');
    expect(m.attachments).toEqual(['file:///TEST_label.jpg']);
    expect(m.body).toContain('TEST1005654957');
    expect(m.subject).toContain('TEST1005654957');
    expect(m.body).toContain('صور مرفقة: 1');
    expect(`${m.subject}\n${m.body}`).not.toContain('TEST_SELLER_SHOP');
  });
});

describe('report message', () => {
  it('marks unread fields explicitly instead of leaving them out or guessing', () => {
    const m = buildReportMessage({ ...base, used: {}, photoUris: [] }, 'غير كافٍ للحكم');
    expect(m.body).toContain('رقم التشغيلة: غير مقروء');
    expect(m.body).not.toContain('صور مرفقة');
  });
  it('states that the result is not a ruling on authenticity, in every language', () => {
    expect(buildReportMessage({ ...base, lang: 'en' }, 'Does not match').body).toContain('not a ruling on authenticity');
    expect(buildReportMessage({ ...base, lang: 'tr' }, 'Uyumsuz').body).toContain('orijinallik hükmü değildir');
  });
  it('records the method version used', () => {
    expect(buildReportMessage(base, 'x').body).toContain(`${verdict.methodVersion}/${verdict.methodSha256.slice(0, 8)}`);
  });
});
