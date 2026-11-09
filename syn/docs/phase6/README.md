# المرحلة ٦ — شكل العبوة (تجريبي)

## ما بُني
| الجزء | المكان |
|---|---|
| البصمة البصرية `visual-v1` وفك ترميز JPEG/PNG | `packages/visual` |
| حساب البصمة في دالة `extract-label` من الصورة نفسها | `supabase/functions/extract-label` |
| أعمدة البصمة والمراجعة في `reference_images`، وإرجاع الصور المعتمدة في `lookup_gtin` و`product_reference` | `supabase/migrations/20261109001000_visual.sql` |
| إشارة `packaging_similarity` والعتبات (method v1 rc3) | `packages/scan-signals`, `method/v1/rules.yaml` |
| شارة "تجريبي" في الأسباب، وتصغير الصور قبل الرفع | `apps/mobile` |
| أداة إضافة الصور المرجعية واعتمادها | `tools/images/reference.mts` |

## معيار القبول
"الإشارة تظهر بعلامة تجريبي ولا تكفي وحدها لإصدار غير مطابق": مُختبر في `packages/scan-signals/test/ingredients.test.ts` (phase 6 acceptance). عبوة مختلفة تماماً في الشكل تعطي وحدها "فروق بسيطة" فقط، مع التعليق `experimental_signal`.

## التحقق على المشروع المنشور
قراءة حية للملصق التجريبي أعادت البصمة (`visual-v1 x128`)، والحكم لم يتغير ("غير مطابق" بسبب الإنذار).

## لإضافة صورة مرجعية
```bash
npx tsx tools/images/reference.mts add IQB-0002 sample.jpg --acquisition authorized_agent_sample --source-url https://<مصدر العينة> > add.sql
python tools/deploy/sb_sql.py --ref <project> add.sql
npx tsx tools/images/reference.mts approve <id> --note "صورة عينة من الوكيل، راجعها فلان" > ok.sql
```
