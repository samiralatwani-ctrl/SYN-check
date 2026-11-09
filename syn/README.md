# SYN: Check Before Use — افحص قبل الاستخدام

المواصفات في `CLAUDE.md`، والقرارات في `DECISIONS.md`، ووثائق المراحل في `docs/`.

## تشغيل محلي (المرحلة ١)
```bash
# قاعدة محلية تحاكي Supabase + كل الـ migrations
SYN_DB_URL=postgresql://syn:syn@localhost/syn supabase/tests/reset_local.sh

# الاستيراد (الملفات الحقيقية في data/ ولا تُرفع إلى git)
pip install "psycopg[binary]" openpyxl pytest
export SYN_DB_URL=postgresql://syn:syn@localhost/syn
python tools/importer/syn_import.py iqb data/*Initial_Registry*.xlsx data/*Batch_2*.xlsx
python tools/importer/syn_import.py pilot data/*Pilot_JUVEDERM*.xlsx

# الاختبارات (قاعدة اختبار منفصلة؛ اختبار القبول يعمل عند ضبط SYN_DATA_DIR)
cd tools/importer && SYN_DATA_DIR=../../data pytest -q

# لوحة الإدارة
cd apps/admin && cp .env.example .env.local && npm install && npm run dev   # http://localhost:3100
```
