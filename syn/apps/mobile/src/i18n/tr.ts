import type { Dict } from './ar';
import { en } from './en';
// Turkish: core screens translated; less frequent texts fall back to English until reviewed by a native speaker.
export const tr: Dict = {
  ...en,
  app: { name: 'SYN: Kullanmadan Önce Kontrol Et', demo: 'Demo modu: TEST_ verileri, gerçek ürün değildir' },
  tabs: { scan: 'Tara', about: 'Yöntem hakkında', settings: 'Ayarlar', explore: 'Keşfet' },
  scan: {
    ...en.scan,
    modes: { barcode: 'Barkod', label: 'Etiket ve içerik', package: 'Ambalaj şekli' },
    soon: 'Yakında', aim: 'Kamerayı barkoda tutun ve sabit bekleyin', grant: 'Kameraya izin ver',
    manual: 'Veya barkod numarasını girin', check: 'Kontrol et', checking: 'Kontrol ediliyor…',
    search: 'Marka veya ürün adıyla ara', noResults: 'Veritabanında sonuç yok',
  },
  status: { verified: 'Doğrulanmış', candidate_unverified: 'Doğrulanmamış aday', retired: 'Kullanım dışı' },
  verdict: {
    match: { title: 'Referansla uyumlu', body: 'Kontrol edilen her şey belgelenmiş ürünle uyumlu. Bu, orijinalliği garanti etmez; en güçlü güvence yetkili distribütörden satın almaktır.' },
    minor: { title: 'Küçük farklar', body: 'Meşru olabilecek bir fark: başka bir pazar sürümü veya formül güncellemesi.' },
    suspect: { title: 'Şüpheli', body: 'Kullanmadan önce kontrol gerektiren önemli bir fark.' },
    mismatch: { title: 'Uyumsuz', body: 'Resmî bir kaynakla açık bir çelişki. Kontrol etmeden kullanmayın.' },
    insufficient: { title: 'Karar için yetersiz', body: 'Mevcut bilgiler karar vermek için yeterli değil.' },
  },
  result: { ...en.result, reasons: 'Gerekçeler', whatNow: 'Şimdi ne yapmalıyım?', source: 'Resmî kaynak', lastVerified: 'Son doğrulama' },
  annotation: { ...en.annotation, medical_professional_only: 'Tıbbi cihaz veya ilaç: yalnızca uzman hekim tarafından kullanılmalıdır.', expired_banner: 'Son kullanma tarihi geçmiş — kullanmayın.' },
  signal: {
    ...en.signal,
    alert_product_all_batches: { mismatch: 'Bu ürün tüm serileri kapsayan bir resmî uyarıya konu' },
    barcode_lookup: { match: 'Barkod doğrulanmış bir ürünle eşleşiyor', unavailable: 'Barkod veritabanında doğrulanmış bir ürüne bağlı değil' },
  },
  settings: { language: 'Dil', comingSoon: 'Kürtçe (Sorani ve Kurmanci) yakında' },
};
