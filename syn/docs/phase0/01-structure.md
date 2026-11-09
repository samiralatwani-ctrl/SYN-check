# ١. هيكل المشروع (Monorepo)

```
syn/
├── CLAUDE.md                      # البرومبت المرجعي (نسخة من الوثيقة الأصلية)
├── DECISIONS.md                   # سجل القرارات التقنية
├── package.json / pnpm-workspace.yaml / turbo.json
│
├── apps/
│   ├── mobile/                    # Expo (Dev Build) + TypeScript + expo-router
│   │   ├── app/                   # الشاشات: (tabs)/scan, history, explore, settings
│   │   │   ├── result/[scanId].tsx
│   │   │   ├── evidence/[variantId].tsx
│   │   │   ├── next-steps/[scanId].tsx
│   │   │   ├── report/[scanId].tsx
│   │   │   └── about-method.tsx   # صفحة "عن المنهج" الإلزامية
│   │   ├── src/camera/            # vision-camera: باركود / ملصق / عبوة + إرشادات التصوير
│   │   ├── src/offline/           # SQLite: نسخة مخففة من القاعدة + السجل المحلي
│   │   └── src/ui/                # مكونات RTL، الحالات الخمس (لون + أيقونة + نص)
│   └── admin/                     # Next.js: مراجعة الأدلة، الاستيراد، البلاغات، نسخ المنهج
│
├── packages/
│   ├── rules-engine/              # محرك القواعد: TypeScript نقي، بلا IO، حتمي
│   │   ├── src/                   # evaluate(signals, context, method) -> Verdict
│   │   └── test/                  # يشغّل method/*/cases.yaml + حالات حدية
│   ├── gs1/                       # Check digit، تحليل GS1 DataMatrix (AI 01/10/11/17/21)، التطبيع إلى GTIN-14
│   ├── signals/                   # بناء الإشارات: barcode, label, dates, batch, alerts, ingredients, packaging, channel
│   ├── schemas/                   # JSON Schema + zod: إخراج قراءة الملصق، Signal، Verdict
│   ├── inci/                      # توحيد أسماء INCI والمرادفات
│   └── i18n/                      # ar (افتراضي) / en — كل نصوص الحالات والأسباب
│
├── supabase/
│   ├── migrations/                # الجداول + RLS (قراءة عامة، كتابة للمشرفين)
│   ├── functions/                 # Edge Functions (Deno)
│   │   ├── extract-label/         # نموذج الرؤية → JSON صارم (المفتاح على الخادم فقط)
│   │   ├── evaluate-scan/         # يبني الإشارات ويشغّل rules-engine ويحفظ النتيجة بنسخة المنهج
│   │   ├── submit-report/
│   │   └── offline-pack/          # يولّد الحزمة المخففة للتطبيق
│   └── tests/                     # pgTAP لاختبار RLS
│
├── tools/
│   └── importer/                  # Python + openpyxl: استيراد Excel كما هو (raw jsonb + تعيين أعمدة صريح)
│
├── method/
│   └── v1/
│       ├── rules.yaml             # قواعد الدمج v1 (مصدر الحقيقة، تُنسخ إلى method_versions)
│       └── cases.yaml             # حالات الاختبار المرجعية لقواعد v1
│
├── test-fixtures/                 # بيانات اختبار فقط، كل المعرفات تبدأ بـ TEST_ — لا تُحمَّل في القاعدة الحقيقية
└── docs/
    ├── phase0/
    └── store/                     # (المرحلة ٧) الخصوصية، سياسة التصحيح، ملفات المتاجر
```

## مبادئ الفصل
- **`rules-engine` لا يعرف شيئاً عن الكاميرا أو الشبكة أو الذكاء الاصطناعي.** يستقبل إشارات جاهزة ويُخرج حكماً. هذا ما يجعله قابلاً لإعادة الإنتاج والاختبار.
- النتيجة الرسمية تُحسب على الخادم (`evaluate-scan`). التطبيق يشغّل الحزمة نفسها دون اتصال للمنتجات الموجودة في الحزمة المخففة، ويُعلَّم الناتج بـ `computed_offline`.
- نموذج الرؤية يملأ `label-extraction.schema.json` فقط. لا يرى قواعد الدمج ولا يُسأل "هل هو أصلي؟".
