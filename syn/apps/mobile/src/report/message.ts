import type { Verdict } from '@syn/rules-engine';
import type { ScanBuild } from '@syn/scan-signals';

/**
 * The ready-made report (CLAUDE.md §7 screen 5). It contains the photos and the batch, and is sent only to
 * the manufacturer / regulator the user chooses. It NEVER names the seller: no seller field exists in the input.
 */
export interface ReportInput {
  lang: 'ar' | 'en' | 'tr';
  productName: string | null;
  brand: string | null;
  gtin14: string | null;
  used: ScanBuild['used'];             // batch / dates as read and confirmed
  verdict: Verdict;
  reasonTexts: string[];               // already-translated reason lines, mismatches first
  purchaseChannel?: string | null;     // channel type only (e.g. social media), never a shop or account name
  country?: string | null;             // where it was bought, e.g. "Iraq"
  photoUris: string[];                 // label photos the user agreed to attach
  createdAt: string;
  appName: string;
}
export interface ReportMessage { subject: string; body: string; attachments: string[] }

const L = {
  ar: { subj: 'بلاغ اشتباه بمنتج', product: 'المنتج', brand: 'العلامة', gtin: 'الباركود (GTIN)', batch: 'رقم التشغيلة',
    mfg: 'تاريخ التصنيع', exp: 'تاريخ الانتهاء', result: 'نتيجة الفحص', reasons: 'الأسباب', channel: 'قناة الشراء', country: 'بلد الشراء',
    photos: 'صور مرفقة', date: 'تاريخ الفحص', notRead: 'غير مقروء',
    intro: 'أرسل هذا البلاغ للتحقق من عبوة اشتريتها. أرجو التأكد من رقم التشغيلة والتواريخ وإفادتي إن كانت العبوة أصلية.',
    note: 'النتيجة أعلاه مقارنة آلية بمصادر رسمية منشورة، وليست حكماً بالأصالة أو التقليد.' },
  en: { subj: 'Suspected product report', product: 'Product', brand: 'Brand', gtin: 'Barcode (GTIN)', batch: 'Batch / lot number',
    mfg: 'Manufacture date', exp: 'Expiry date', result: 'Check result', reasons: 'Reasons', channel: 'Purchase channel', country: 'Country of purchase',
    photos: 'Photos attached', date: 'Checked on', notRead: 'not read',
    intro: 'I am reporting a pack I bought so it can be verified. Please check the batch number and dates and let me know whether this pack is genuine.',
    note: 'The result above is an automated comparison with published official sources, not a ruling on authenticity.' },
  tr: { subj: 'Şüpheli ürün bildirimi', product: 'Ürün', brand: 'Marka', gtin: 'Barkod (GTIN)', batch: 'Lot / seri no',
    mfg: 'Üretim tarihi', exp: 'Son kullanma tarihi', result: 'Kontrol sonucu', reasons: 'Gerekçeler', channel: 'Satın alma kanalı', country: 'Satın alındığı ülke',
    photos: 'Ekli fotoğraflar', date: 'Kontrol tarihi', notRead: 'okunamadı',
    intro: 'Satın aldığım bir ürünün doğrulanması için bildirimde bulunuyorum. Lütfen lot numarasını ve tarihleri kontrol ederek ürünün orijinal olup olmadığını bildiriniz.',
    note: 'Yukarıdaki sonuç, yayımlanmış resmî kaynaklarla otomatik bir karşılaştırmadır; orijinallik hükmü değildir.' },
};

export function buildReportMessage(r: ReportInput, verdictTitle: string): ReportMessage {
  const t = L[r.lang];
  const v = (x?: string | null) => x || t.notRead;
  const name = [r.brand, r.productName].filter(Boolean).join(' ') || t.notRead;
  const lines = [
    t.intro, '',
    `${t.product}: ${name}`,
    `${t.gtin}: ${v(r.gtin14)}`,
    `${t.batch}: ${v(r.used.batch)}`,
    `${t.mfg}: ${v(r.used.manufacture)}`,
    `${t.exp}: ${v(r.used.expiry)}`,
    r.country ? `${t.country}: ${r.country}` : null,
    r.purchaseChannel ? `${t.channel}: ${r.purchaseChannel}` : null,
    `${t.date}: ${r.createdAt.slice(0, 10)}`, '',
    `${t.result}: ${verdictTitle} (${r.appName}, ${r.verdict.methodVersion}/${r.verdict.methodSha256.slice(0, 8)})`,
    `${t.reasons}:`, ...r.reasonTexts.map((x) => `- ${x}`), '',
    r.photoUris.length ? `${t.photos}: ${r.photoUris.length}` : null,
    t.note,
  ].filter((x): x is string => x !== null);
  return {
    subject: `${t.subj}: ${name}${r.used.batch ? ` — ${t.batch} ${r.used.batch}` : ''}`,
    body: lines.join('\n'),
    attachments: r.photoUris,
  };
}
