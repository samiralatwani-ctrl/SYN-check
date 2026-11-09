#!/usr/bin/env python3
"""SYN importer for the IQB candidate registries and the JUVÉDERM pilot reference file.

Principles (CLAUDE.md §6.4):
  * Every row of every sheet is stored verbatim in raw_import_rows, with the file's SHA-256.
  * Columns are mapped explicitly. An unknown header, or a value under a header-less column, stops the import.
  * Nothing is invented: no GTIN, no registration number, no market. A placeholder text in the file
    (e.g. 'بانتظار مطابقة الاسم الرسمي') becomes NULL in typed columns and stays verbatim in raw rows.
  * IQB rows are imported as candidate_unverified. Seller data goes to the staff-only listing_sources table.
  * Re-importing the same file (same SHA-256) is a no-op.

Usage:
  python syn_import.py --db postgresql://... iqb   FILE.xlsx [FILE.xlsx ...]
  python syn_import.py --db postgresql://... pilot FILE.xlsx
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl
import psycopg
from openpyxl.utils import get_column_letter

# ----------------------------------------------------------------------------- column contracts
IQB_PRODUCTS = ['المعرّف', 'الفئة الوظيفية الأولية', 'العلامة حسب المصدر', 'الاسم كما عرضه البائع',
                'الاسم بشاهد رسمي', 'حالة مطابقة الاسم', 'حالة التركيبة والنشرة', 'التسجيل العراقي',
                'المراجعة العلمية / الطبية', 'الإجراء المطلوب', 'تاريخ الجمع']
IQB_EVIDENCE_V1 = ['المعرّف', 'مصدر العرض المحلي', 'رابط المنتج المحلي', 'شاهد الاسم الرسمي',
                   'مرجع العلامة أو التصنيف فقط', 'الباركود كما أورده البائع', 'المتغيرات كما أوردها البائع',
                   'حالة إثبات التداول', 'ملاحظات التحقق']
IQB_EVIDENCE_V2 = IQB_EVIDENCE_V1 + ['قائمة الأكثر مبيعًا لدى المتجر', 'روابط إضافية للاسم أو العائلة',
                                     'عدد مصادر العرض المحلية', 'حدود مؤشر التداول']
PILOT_PRODUCTS = ['المعرّف', 'الفئة', 'الاسم لدى البائع', 'الاسم الرسمي', 'العلامة', 'الشركة الأم',
                  'العبوة الرسمية', 'التركيز', 'بلد المنشأ / عنوان التصنيع', 'الباركود لدى البائع',
                  'الباركود الرسمي', 'نتيجة GS1', 'علامات الأصالة والتتبّع', 'نشرة الاستعمال الرسمية',
                  'دليل المصنّع', 'دليل لبنان', 'دليل السعودية', 'ملاحظة السعودية', 'دليل العراق',
                  'تفاصيل تسجيل لبنان', 'مطابقة الحجم مع البائع', 'ملاحظات التحقق',
                  'عدد الأدلة الرسمية المطابقة', 'حالة التوثيق', 'تاريخ آخر تحقق']
PILOT_ALERTS = ['الجهة', 'التاريخ', 'المنتج', 'رقم التشغيلة كما نشرته الجهة', 'رمز المنتج',
                'الأصلي: تصنيع / انتهاء', 'المقلد: تصنيع / انتهاء', 'قناة البيع', 'الملاحظة', 'المصدر']
PILOT_SOURCES = ['الرمز', 'الوصف', 'نوع المصدر', 'الرابط', 'تاريخ التحقق']

# Texts that mean "no value" in a typed column. They stay verbatim in raw rows and review columns.
PLACEHOLDERS = {'بانتظار مطابقة الاسم الرسمي', 'غير محقق', 'غير متوفر رسمياً', 'لم يورده البائع'}

EVIDENCE_STATUS = {'نعم': 'yes', 'جزئي': 'partial', 'لا': 'no', 'لم يُتحقق': 'not_checked'}

# pilot evidence column -> (country, column holding the cited text / source codes)
PILOT_EVIDENCE = [
    ('دليل المصنّع', None, 'نشرة الاستعمال الرسمية'),
    ('دليل لبنان', 'LB', 'تفاصيل تسجيل لبنان'),
    ('دليل السعودية', 'SA', 'ملاحظة السعودية'),
    ('دليل العراق', 'IQ', None),
]
DOCUMENTED_STATUSES = {'✅ موثّق رسمياً', '⚠️ موثّق خارج العراق'}   # D-016
AGENT_COUNTRY = {'لبنان': 'LB', 'العراق': 'IQ', 'السعودية': 'SA', 'تركيا': 'TR', 'الأردن': 'JO'}
BRAND_CARD = {
    'الشركة المالكة': 'parent_company', 'الموقع الإقليمي': 'regional_site', 'التواصل الرسمي': 'contact_info',
    'صفحة مكافحة التقليد': 'anti_counterfeit_page', 'آلية التحقق الرسمية': 'official_verification_method',
    'العلامات الأمنية المعلنة': 'declared_security_features', 'الحكم العملي': 'practical_note',
}
SOURCE_CODE = re.compile(r'\bS(\d+)\b')
MONTH_PAIR = re.compile(r'^\s*(\d{2})\.(\d{4})\s*/\s*(\d{2})\.(\d{4})\s*$')


class ImportError_(Exception):
    pass


# ----------------------------------------------------------------------------- helpers
def jsonable(v):
    if isinstance(v, (dt.datetime, dt.date)):
        return v.isoformat()
    return v


def clean(v):
    """Typed-column value: None for blanks and placeholders, stripped text otherwise."""
    if v is None:
        return None
    if isinstance(v, str):
        s = v.strip()
        return None if s == '' or s in PLACEHOLDERS else s
    return v


def as_date(v):
    if v is None:
        return None
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    return dt.date.fromisoformat(str(v).strip())


def norm_name(s: str) -> str:
    s = unicodedata.normalize('NFKC', s).replace('®', '').replace('™', '')
    return re.sub(r'\s+', ' ', s).strip().casefold()


def source_codes(text) -> list[str]:
    return ['S' + m for m in SOURCE_CODE.findall(text or '')]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_sheet(ws):
    """Return list of (excel_row_number, tuple_of_values) for non-empty rows."""
    out = []
    for i, row in enumerate(ws.iter_rows(values_only=True), start=1):
        if any(c is not None and (not isinstance(c, str) or c.strip()) for c in row):
            out.append((i, row))
    return out


def table(ws, expected_headers: list[list[str]]):
    """Parse a header+rows sheet. Header must equal one of the allowed contracts exactly."""
    rows = read_sheet(ws)
    if not rows:
        raise ImportError_(f'sheet {ws.title!r} is empty')
    hdr_row, hdr = rows[0]
    width = max((i for i, h in enumerate(hdr) if h is not None), default=-1) + 1
    header = [str(h).strip() for h in hdr[:width]]
    if header not in expected_headers:
        raise ImportError_(f'sheet {ws.title!r}: unexpected header {header}')
    records = []
    for rn, row in rows[1:]:
        extra = [c for c in row[width:] if c not in (None, '')]
        if extra:
            raise ImportError_(f'sheet {ws.title!r} row {rn}: values outside known columns: {extra}')
        records.append((rn, dict(zip(header, row[:width]))))
    return header, records


def store_raw(cur, batch_id, wb, tabular: dict):
    """Store every non-empty row of every sheet. Tabular sheets keyed by header, others by column letter."""
    n = 0
    for ws in wb.worksheets:
        if ws.title in tabular:
            for rn, rec in tabular[ws.title]:
                ref = rec.get('المعرّف')
                cur.execute('insert into raw_import_rows (batch_id, sheet, row_number, cells, external_ref) '
                            'values (%s,%s,%s,%s,%s)',
                            (batch_id, ws.title, rn, json.dumps({k: jsonable(v) for k, v in rec.items()},
                                                                ensure_ascii=False), ref))
                n += 1
        else:
            for rn, row in read_sheet(ws):
                cells = {get_column_letter(i + 1): jsonable(v) for i, v in enumerate(row) if v is not None}
                cur.execute('insert into raw_import_rows (batch_id, sheet, row_number, cells) values (%s,%s,%s,%s)',
                            (batch_id, ws.title, rn, json.dumps(cells, ensure_ascii=False)))
                n += 1
    return n


def new_batch(cur, kind, path: Path):
    digest = sha256(path)
    cur.execute('select id from import_batches where sha256 = %s', (digest,))
    if cur.fetchone():
        return None
    cur.execute('insert into import_batches (kind, file_name, sha256, row_count) values (%s,%s,%s,0) returning id',
                (kind, path.name, digest))
    return cur.fetchone()[0]


def upsert_source(cur, url, title=None, source_type=None, verified=None):
    cur.execute(
        'insert into sources (url, title, source_type, last_verified_at) values (%s,%s,%s,%s) '
        'on conflict (url) do update set title = coalesce(sources.title, excluded.title), '
        'source_type = coalesce(sources.source_type, excluded.source_type), '
        'last_verified_at = greatest(sources.last_verified_at, excluded.last_verified_at) returning id',
        (url, title, source_type, verified))
    return cur.fetchone()[0]


def add_evidence(cur, *, product_id, country, label, field, status, value_text, verified, batch_id, source_ids=()):
    cur.execute('insert into evidence (product_id, country, authority_label, field, status, value_text, '
                'last_verified_at, batch_id) values (%s,%s,%s,%s,%s,%s,%s,%s) returning id',
                (product_id, country, label, field, status, value_text, verified, batch_id))
    eid = cur.fetchone()[0]
    for sid in source_ids:
        cur.execute('insert into evidence_sources values (%s,%s) on conflict do nothing', (eid, sid))
    return eid


# ----------------------------------------------------------------------------- IQB
def import_iqb(conn, path: Path) -> str:
    wb = openpyxl.load_workbook(path, data_only=True)
    _, products = table(wb['قائمة المنتجات'], [IQB_PRODUCTS])
    _, evidence = table(wb['الأدلة والعبوات'], [IQB_EVIDENCE_V1, IQB_EVIDENCE_V2])
    ev_by_ref = {r['المعرّف']: r for _, r in evidence}
    refs = [r['المعرّف'] for _, r in products]
    if len(set(refs)) != len(refs) or set(refs) != set(ev_by_ref):
        raise ImportError_('product and evidence sheets do not list the same unique identifiers')

    with conn.cursor() as cur:
        batch_id = new_batch(cur, 'iqb', path)
        if batch_id is None:
            return f'{path.name}: already imported (same SHA-256), nothing changed'
        raw_n = store_raw(cur, batch_id, wb, {'قائمة المنتجات': products, 'الأدلة والعبوات': evidence})

        for _, p in products:
            ref = p['المعرّف']
            e = ev_by_ref[ref]
            official = clean(p['الاسم بشاهد رسمي'])
            cur.execute(
                'insert into products (external_ref, brand_raw, category_raw, official_name, official_name_batch_id) '
                'values (%s,%s,%s,%s,%s) on conflict (external_ref) do update set '
                'brand_raw = excluded.brand_raw, category_raw = excluded.category_raw, '
                'official_name = coalesce(products.official_name, excluded.official_name), '
                'official_name_batch_id = coalesce(products.official_name_batch_id, excluded.official_name_batch_id), '
                'updated_at = now() returning id',
                (ref, p['العلامة حسب المصدر'], p['الفئة الوظيفية الأولية'], official,
                 batch_id if official else None))
            pid = cur.fetchone()[0]

            cur.execute(
                'insert into product_review_status values (%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict (product_id) do update set '
                'name_match_status=excluded.name_match_status, formula_status=excluded.formula_status, '
                'iraq_registration_status=excluded.iraq_registration_status, '
                'scientific_review_status=excluded.scientific_review_status, required_action=excluded.required_action, '
                'verification_notes=excluded.verification_notes, circulation_limits=excluded.circulation_limits, '
                'batch_id=excluded.batch_id',
                (pid, p['حالة مطابقة الاسم'], p['حالة التركيبة والنشرة'], p['التسجيل العراقي'],
                 p['المراجعة العلمية / الطبية'], p['الإجراء المطلوب'], e['ملاحظات التحقق'],
                 e.get('حدود مؤشر التداول'), batch_id))

            cnt = e.get('عدد مصادر العرض المحلية')
            cur.execute(
                'insert into listing_sources (product_id, batch_id, seller_name, listing_url, name_as_listed, '
                'variants_as_listed, barcode_as_listed, circulation_status, best_seller_list_url, extra_links, '
                'local_source_count, collected_at) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (pid, batch_id, e['مصدر العرض المحلي'], e['رابط المنتج المحلي'], p['الاسم كما عرضه البائع'],
                 e['المتغيرات كما أوردها البائع'], e['الباركود كما أورده البائع'], e['حالة إثبات التداول'],
                 e.get('قائمة الأكثر مبيعًا لدى المتجر'), e.get('روابط إضافية للاسم أو العائلة'),
                 int(cnt) if cnt is not None else None, p['تاريخ الجمع']))

            collected = as_date(p['تاريخ الجمع'])
            witness = clean(e['شاهد الاسم الرسمي'])
            if witness:
                # A name witness proves the name exists, not that the pack matches -> 'partial'.
                add_evidence(cur, product_id=pid, country=None, label='شاهد الاسم الرسمي',
                             field='official_name_witness', status='partial', value_text=official,
                             verified=collected, batch_id=batch_id,
                             source_ids=[upsert_source(cur, witness, verified=collected)])
            brand_ref = clean(e['مرجع العلامة أو التصنيف فقط'])
            if brand_ref:
                add_evidence(cur, product_id=pid, country=None, label='مرجع العلامة أو التصنيف فقط',
                             field='brand_or_class_reference', status='not_checked', value_text=None,
                             verified=collected, batch_id=batch_id,
                             source_ids=[upsert_source(cur, brand_ref, verified=collected)])

        cur.execute('update import_batches set row_count = %s where id = %s', (raw_n, batch_id))
    return f'{path.name}: {len(products)} candidate products, {raw_n} raw rows'


# ----------------------------------------------------------------------------- pilot
def import_pilot(conn, path: Path) -> str:
    wb = openpyxl.load_workbook(path, data_only=True)
    _, products = table(wb['المنتجات'], [PILOT_PRODUCTS])
    _, alerts = table(wb['الإنذارات الرقابية'], [PILOT_ALERTS])
    _, sources = table(wb['المصادر'], [PILOT_SOURCES])
    card_ws = wb['بطاقات العلامات']
    card_rows = read_sheet(card_ws)
    if [str(c).strip() for c in card_rows[0][1][:1]] != ['البند']:
        raise ImportError_('brand card sheet: first header must be البند')

    with conn.cursor() as cur:
        batch_id = new_batch(cur, 'pilot', path)
        if batch_id is None:
            return f'{path.name}: already imported (same SHA-256), nothing changed'
        raw_n = store_raw(cur, batch_id, wb, {'المنتجات': products, 'الإنذارات الرقابية': alerts, 'المصادر': sources})

        # sources
        code_to_id = {}
        for _, s in sources:
            sid = upsert_source(cur, s['الرابط'].strip(), s['الوصف'], s['نوع المصدر'], as_date(s['تاريخ التحقق']))
            code_to_id[s['الرمز'].strip()] = sid
            cur.execute('insert into source_aliases values (%s,%s,%s)', (batch_id, s['الرمز'].strip(), sid))

        def sids(text):
            missing = [c for c in source_codes(text) if c not in code_to_id]
            if missing:
                raise ImportError_(f'text cites unknown source codes {missing}: {text!r}')
            return [code_to_id[c] for c in dict.fromkeys(source_codes(text))]

        # brand cards (one column per brand)
        header = card_rows[0][1]
        brand_ids = {}
        for col in range(1, len(header)):
            if header[col] is None:
                continue
            name = str(header[col]).strip()
            card = {str(r[0]).strip(): r[col] for _, r in card_rows[1:] if r[0] is not None}
            fields = {dbcol: card.get(key) for key, dbcol in BRAND_CARD.items()}
            cur.execute(
                'insert into brands (name, parent_company, regional_site, contact_info, anti_counterfeit_page, '
                'official_verification_method, declared_security_features, practical_note, last_verified_at, card_raw, batch_id) '
                'values (%(name)s,%(parent_company)s,%(regional_site)s,%(contact_info)s,%(anti_counterfeit_page)s,'
                '%(official_verification_method)s,%(declared_security_features)s,%(practical_note)s,%(lv)s,%(raw)s,%(b)s) '
                'on conflict (name) do update set parent_company=excluded.parent_company, regional_site=excluded.regional_site, '
                'contact_info=excluded.contact_info, anti_counterfeit_page=excluded.anti_counterfeit_page, '
                'official_verification_method=excluded.official_verification_method, '
                'declared_security_features=excluded.declared_security_features, practical_note=excluded.practical_note, '
                'last_verified_at=excluded.last_verified_at, card_raw=excluded.card_raw, batch_id=excluded.batch_id '
                'returning id',
                {**fields, 'name': name, 'lv': as_date(card.get('تاريخ آخر تحقق')),
                 'raw': json.dumps({k: jsonable(v) for k, v in card.items()}, ensure_ascii=False), 'b': batch_id})
            bid = cur.fetchone()[0]
            brand_ids[name] = bid
            cur.execute('delete from brand_agents where brand_id = %s', (bid,))
            for key, text in card.items():
                if not key.startswith('الوكيل المعتمد:') or text is None:
                    continue
                label = key.split(':', 1)[1].strip()
                country = AGENT_COUNTRY.get(label)
                availability = 'not_available_officially' if str(text).startswith('غير متوفر رسمياً') else 'listed'
                cur.execute('insert into brand_agents (brand_id, country, region_label, availability, agent_text, '
                            'last_verified_at, batch_id) values (%s,%s,%s,%s,%s,%s,%s) returning id',
                            (bid, country, None if country else label, availability, str(text),
                             as_date(card.get('تاريخ آخر تحقق')), batch_id))
                aid = cur.fetchone()[0]
                for sid in sids(str(text)):
                    cur.execute('insert into brand_agent_sources values (%s,%s)', (aid, sid))

        # products, variants, evidence
        name_to_pid = {}
        for _, p in products:
            status_file = p['حالة التوثيق']
            vstatus = 'verified' if status_file in DOCUMENTED_STATUSES else 'candidate_unverified'
            brand = p['العلامة'].strip()
            if brand not in brand_ids:
                raise ImportError_(f'product {p["المعرّف"]} names brand {brand!r} with no brand card')
            cur.execute(
                'insert into products (external_ref, brand_id, brand_raw, category_raw, official_name, official_name_batch_id, '
                'verification_status, documentation_status_file, documentation_count_file) '
                'values (%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict (external_ref) do update set '
                'brand_id=excluded.brand_id, official_name=excluded.official_name, '
                'official_name_batch_id=excluded.official_name_batch_id, verification_status=excluded.verification_status, '
                'documentation_status_file=excluded.documentation_status_file, '
                'documentation_count_file=excluded.documentation_count_file, '
                'category_raw=coalesce(products.category_raw, excluded.category_raw), updated_at=now() returning id',
                (p['المعرّف'], brand_ids[brand], brand, p['الفئة'], p['الاسم الرسمي'], batch_id, vstatus,
                 status_file, p['عدد الأدلة الرسمية المطابقة']))
            pid = cur.fetchone()[0]
            name_to_pid[norm_name(p['الاسم الرسمي'])] = pid
            verified = as_date(p['تاريخ آخر تحقق'])

            # pilot replaces this product's earlier pilot evidence/variant (a new file version is authoritative)
            cur.execute("delete from evidence where product_id = %s and field = 'product_evidence'", (pid,))
            cur.execute('delete from product_variants where product_id = %s and batch_id in '
                        "(select id from import_batches where kind = 'pilot')", (pid,))
            cur.execute(
                'insert into product_variants (product_id, gtin_status_text, gs1_result_text, package_text, '
                'concentration_text, origin_text, security_features_text, ifu_reference_text, verification_status, batch_id) '
                'values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (pid, p['الباركود الرسمي'], p['نتيجة GS1'], p['العبوة الرسمية'], p['التركيز'],
                 p['بلد المنشأ / عنوان التصنيع'], p['علامات الأصالة والتتبّع'], p['نشرة الاستعمال الرسمية'],
                 vstatus, batch_id))

            for col, country, text_col in PILOT_EVIDENCE:
                raw_status = (p[col] or '').strip()
                if raw_status not in EVIDENCE_STATUS:
                    raise ImportError_(f'{p["المعرّف"]} {col}: unknown evidence status {raw_status!r}')
                text = p[text_col] if text_col else None
                cited = sids(text) if text else []
                if col == 'دليل المصنّع':      # the IFU column cites the manufacturer documents
                    cited = sids(p['نشرة الاستعمال الرسمية'])
                add_evidence(cur, product_id=pid, country=country, label=col, field='product_evidence',
                             status=EVIDENCE_STATUS[raw_status], value_text=text, verified=verified,
                             batch_id=batch_id, source_ids=cited)

            cur.execute(
                'insert into product_review_status (product_id, verification_notes, batch_id) values (%s,%s,%s) '
                'on conflict (product_id) do update set verification_notes = excluded.verification_notes',
                (pid, p['ملاحظات التحقق'], batch_id))
            cur.execute(
                'insert into listing_sources (product_id, batch_id, name_as_listed, barcode_as_listed, size_match_text) '
                'values (%s,%s,%s,%s,%s)', (pid, batch_id, p['الاسم لدى البائع'], p['الباركود لدى البائع'],
                                            p['مطابقة الحجم مع البائع']))

        # alerts
        for _, a in alerts:
            authority = a['الجهة'].strip()
            country = None
            if '،' in authority:
                cur.execute('select iso2 from countries where name_ar = %s', (authority.split('،', 1)[1].strip(),))
                row = cur.fetchone()
                country = row[0] if row else None
            src = sids(a['المصدر'])
            if len(src) != 1:
                raise ImportError_(f'alert {authority}: expected exactly one source, got {a["المصدر"]!r}')
            cur.execute('insert into regulatory_alerts (authority, country, alert_date, channel_text, note, source_id, batch_id) '
                        'values (%s,%s,%s,%s,%s,%s,%s) returning id',
                        (authority, country, as_date(a['التاريخ']), a['قناة البيع'], a['الملاحظة'], src[0], batch_id))
            alert_id = cur.fetchone()[0]
            g, c = MONTH_PAIR.match(a['الأصلي: تصنيع / انتهاء'] or ''), MONTH_PAIR.match(a['المقلد: تصنيع / انتهاء'] or '')
            month = lambda m, i: dt.date(int(m.group(i + 1)), int(m.group(i)), 1) if m else None
            cur.execute(
                'insert into alert_items (alert_id, product_id, product_name_raw, batch_as_published, product_code, alert_kind, '
                'genuine_dates_raw, counterfeit_dates_raw, genuine_mfg, genuine_exp, counterfeit_mfg, counterfeit_exp, date_precision) '
                'values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                (alert_id, name_to_pid.get(norm_name(a['المنتج'])), a['المنتج'], str(a['رقم التشغيلة كما نشرته الجهة']).strip(),
                 a['رمز المنتج'],
                 # Genuine dates published for the same batch number => the batch number itself is genuine (copied).
                 'copied_genuine_batch' if g else 'unknown',
                 a['الأصلي: تصنيع / انتهاء'], a['المقلد: تصنيع / انتهاء'],
                 month(g, 1), month(g, 3), month(c, 1), month(c, 3), 'month' if (g or c) else None))

        cur.execute('update import_batches set row_count = %s where id = %s', (raw_n, batch_id))
    return f'{path.name}: {len(products)} pilot products, {len(alerts)} alerts, {len(sources)} sources, {raw_n} raw rows'


# ----------------------------------------------------------------------------- cli
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--db', default=os.environ.get('SYN_DB_URL'), required=os.environ.get('SYN_DB_URL') is None)
    ap.add_argument('kind', choices=['iqb', 'pilot'])
    ap.add_argument('files', nargs='+', type=Path)
    args = ap.parse_args(argv)
    fn = import_iqb if args.kind == 'iqb' else import_pilot
    with psycopg.connect(args.db) as conn:
        for f in args.files:
            try:
                with conn.transaction():
                    print(fn(conn, f))
            except ImportError_ as e:
                print(f'{f.name}: IMPORT REJECTED — {e}', file=sys.stderr)
                return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
