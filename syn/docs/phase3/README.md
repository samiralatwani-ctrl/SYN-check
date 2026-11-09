# المرحلة ٣ — قراءة الملصق والتواريخ والتشغيلة والإنذارات

## ما بُني
| الجزء | المكان |
|---|---|
| مخطط الإخراج المتوافق مع Structured Outputs | `packages/schemas/label-extraction.schema.json` |
| التعليمات للنموذج، والطلب، والتحقق اللاحق | `packages/label-extraction` |
| Edge Function (المفتاح على الخادم، والحد اليومي، وعدم حفظ الصور) | `supabase/functions/extract-label` (نسخة مولّدة في `_shared` عبر `npm run edge:sync`) |
| بناء الإشارات من الباركود والملصق معاً | `packages/scan-signals` |
| تعريف المنتج بالاسم ومرجعه | `supabase/migrations/20261109000600_label_reading.sql` |
| التطبيق: تصوير الملصق، وشاشة "تأكد مما قرأناه"، ودمج الملصق مع فحص الباركود | `apps/mobile/src/app/confirm`, `src/scan/session.ts` |

## معيار القبول
"صورة تحمل التشغيلة المذكورة في إنذار رقابي مع تواريخ المقلّد تعطي غير مطابق":
- **منطق الحكم:** مُختبر في `packages/scan-signals/test/label.test.ts`. النتيجة "غير مطابق" بعد تأكيد المستخدم، و"اشتباه" قبل التأكيد (D-005).
- **مسار التطبيق كاملاً:** مُختبر في `apps/mobile/test/session.test.ts` ببيانات TEST_.
- **الاختبار الحي** (صورة حقيقية ← Claude ← القاعدة ← المحرك): جاهز في `tools/label/live-acceptance.test.ts`، ويعمل عند وجود مفتاح:
  ```bash
  ANTHROPIC_API_KEY=... SYN_DB_URL=postgresql://... npx vitest run tools/label
  ```
  **لم يُشغَّل بعد**، لأن الجلسة لا تملك مفتاح Anthropic API.

## للنشر على Supabase
```bash
supabase secrets set ANTHROPIC_API_KEY=...        # لا يوضع في التطبيق ولا في المستودع
supabase functions deploy extract-label
```
ويجب تفعيل الدخول المجهول (Anonymous sign-ins) في إعدادات المصادقة.

## حدود
- المقارنة بالحجم والتركيز ومدة الصلاحية ونمط التشغيلة تعمل فقط عندما يكون للمرجع قيم منظمة من مصدر رسمي. الملفات الحالية تحمل هذه القيم نصاً فقط، ولا نشتقها آلياً.
- الفلر والبوتوكس لا يصلان إلى "مطابق" دون باركود رسمي في القاعدة (D-010).
