# المرحلة ٧ — التجهيز للنشر

## معيار القبول
"قائمة تحقق متطلبات App Store وGoogle Play مكتملة": القائمة في `docs/store/CHECKLIST.md`. كل بند تقني فيها منجز ومُختبر. البنود الباقية قرارات أو حسابات يملكها المالك (🟡)، ولا يمكن إنجازها نيابة عنه:
- حسابا المطورين في المتجرين.
- اسم الجهة المالكة وبريد الدعم.
- تأكيد المعرّف.
- الأيقونة واللقطات.
- تفعيل GitHub Pages.

## ما بُني
| الجزء | المكان |
|---|---|
| حذف البيانات من داخل التطبيق | `supabase/migrations/20261109001100_delete_my_data.sql`، الإعدادات |
| مدد الحفظ والمهمة اليومية | `supabase/migrations/20261109001200_retention.sql` |
| سياسة الخصوصية، وسياسة التصحيح والحياد (عربي وإنجليزي) وصفحاتهما | `docs/store/`, `docs/site/`, `tools/site/build.py` |
| نصوص المتجرين، وإجابات Data safety وApp Privacy، وملاحظات المراجع | `docs/store/listing.md`, `docs/store/data-safety.md` |
| هوية التطبيق، ونصوص الأذونات، وPrivacy manifest، والأذونات المحجوبة | `apps/mobile/app.json`, `apps/mobile/locales/` |
| ملفات تعريف البناء للتجربة المحدودة | `apps/mobile/eas.json` |
