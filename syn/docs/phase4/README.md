# المرحلة ٤ — المكونات

## ما بُني
| الجزء | المكان |
|---|---|
| تفكيك قوائم INCI وتوحيدها وأعراف التسمية (AQUA/WATER، PARFUM/FRAGRANCE، أرقام CI) والمقارنة | `packages/inci` |
| إشارات المكونات في الحكم | `packages/scan-signals/src/build.ts` (`ingredientSignals`) |
| نسخ التركيبة مع المراجعة، وإرجاع القوائم المعتمدة في `product_reference` و`lookup_gtin` | `supabase/migrations/20261109000700_formulas.sql` |
| أداة جلب القوائم الرسمية (استخراج ← ملف مراجعة ← استيراد معلّق ← اعتماد) | `tools/inci/formula.mts`, `review/formulas/` |
| صفحة مراجعة القوائم في لوحة الإدارة | `apps/admin/app/formulas` |

## معيار القبول
"اختلاف ترتيب المكونات فقط يعطي فروق بسيطة": مُختبر في `packages/scan-signals/test/ingredients.test.ts` (phase 4 acceptance).

## البيانات الحقيقية
استُخرجت قوائم رسمية نظيفة لأربعة منتجات، وهي بانتظار اعتمادك في لوحة الإدارة:

| المنتج | المصدر | عدد المكونات |
|---|---|---|
| IQB-0607 Sally Hansen Double Duty | sallyhansen.com | 12 |
| IQB-0620 Rimmel 60 Seconds Super Shine | rimmellondon.com | 39 |
| IQB-0917 COSRX The 6 Peptide Skin Booster | cosrx.com | 45 |
| IQB-0920 The Ordinary Multi-Peptide + Copper Peptides 1% | theordinary.com | 49 |

صفحات CeraVe وMaybelline تحمّل القائمة بالجافاسكربت، وصفحات Clarins وShiseido وBioderma وRevox لم تعطِ قائمة نظيفة، فلم يُستخرج منها شيء.

```bash
npm run inci:formula -- extract IQB-0920 https://theordinary.com/...   # ثم راجع review/formulas/IQB-0920.json
npm run inci:formula -- import review/formulas/IQB-0920.json
```
