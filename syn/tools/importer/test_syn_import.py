"""Importer tests.

* Synthetic tests use TEST_ fixtures generated on the fly; they never touch real product data.
* The phase-1 acceptance test runs on the real files when SYN_DATA_DIR points to a folder holding them
  (the files are not committed: they contain seller names). It is skipped otherwise.

Run:  SYN_TEST_DB_URL=postgresql://syn:syn@localhost/syn_test SYN_DATA_DIR=/path/to/xlsx pytest -q
"""
import datetime as dt
import os
import subprocess
from pathlib import Path

import openpyxl
import psycopg
import pytest

import syn_import as si

HERE = Path(__file__).resolve().parent
RESET = HERE.parent.parent / 'supabase' / 'tests' / 'reset_local.sh'
DB_URL = os.environ.get('SYN_TEST_DB_URL', 'postgresql://syn:syn@localhost/syn_test')
DATA = Path(os.environ['SYN_DATA_DIR']) if os.environ.get('SYN_DATA_DIR') else None


@pytest.fixture
def conn():
    subprocess.run([str(RESET)], check=True, env={**os.environ, 'SYN_DB_URL': DB_URL}, capture_output=True)
    with psycopg.connect(DB_URL, autocommit=True) as c:
        yield c


def run(conn, fn, path):
    with conn.transaction():
        return fn(conn, path)


def q(conn, sql, *args):
    with conn.cursor() as cur:
        cur.execute(sql, args)
        return cur.fetchall() if cur.description else None


# ----------------------------------------------------------------------------- TEST_ fixture builders
def make_iqb(path, rows, evidence_header=si.IQB_EVIDENCE_V1, products_header=si.IQB_PRODUCTS, extra_cell=None):
    wb = openpyxl.Workbook()
    wb.active.title = 'ملخص الدفعة'
    wb.active.append(['TEST_ summary'])
    p = wb.create_sheet('قائمة المنتجات')
    p.append(products_header)
    e = wb.create_sheet('الأدلة والعبوات')
    e.append(evidence_header)
    for ref, official, witness in rows:
        p.append([ref, 'TEST_category', 'TEST_brand', f'{ref} seller name', official, 's1', 's2', 'لم يُتحقق',
                  's4', 's5', dt.datetime(2026, 11, 8, 12)])
        e.append([ref, 'TEST_seller', f'https://example.test/{ref}', witness, None, None, None, 'circ', 'note'])
    if extra_cell:
        p.cell(row=2, column=len(products_header) + 2, value=extra_cell)
    wb.create_sheet('قواعد الاعتماد').append(['البند', 'القاعدة'])
    wb.save(path)
    return path


def make_pilot(path, ref='TEST_IQB-0001', lebanon='جزئي', ifu='TEST_S1 (code)', cite='S1'):
    wb = openpyxl.Workbook()
    wb.active.title = 'دليل القراءة'
    wb.active.append(['TEST_ guide'])
    p = wb.create_sheet('المنتجات')
    p.append(si.PILOT_PRODUCTS)
    row = {h: f'TEST_{i}' for i, h in enumerate(si.PILOT_PRODUCTS)}
    row.update({'المعرّف': ref, 'الاسم الرسمي': 'TEST_Product® ONE', 'العلامة': 'TEST_BRAND',
                'الباركود الرسمي': 'غير متوفر رسمياً', 'نشرة الاستعمال الرسمية': f'{cite} ({ifu})',
                'دليل المصنّع': 'نعم', 'دليل لبنان': lebanon, 'دليل السعودية': 'لم يُتحقق',
                'ملاحظة السعودية': 'none', 'دليل العراق': 'لم يُتحقق', 'تفاصيل تسجيل لبنان': 'details (S2)',
                'عدد الأدلة الرسمية المطابقة': 1, 'حالة التوثيق': '⚠️ ناقص', 'تاريخ آخر تحقق': '2026-11-09'})
    p.append([row[h] for h in si.PILOT_PRODUCTS])
    b = wb.create_sheet('بطاقات العلامات')
    for r in [['البند', 'TEST_BRAND'], ['الشركة المالكة', 'TEST_owner'], ['الوكيل المعتمد: لبنان', 'TEST_agent (S2)'],
              ['الوكيل المعتمد: العراق', 'غير متوفر رسمياً'], ['تاريخ آخر تحقق', '2026-11-09']]:
        b.append(r)
    a = wb.create_sheet('الإنذارات الرقابية')
    a.append(si.PILOT_ALERTS)
    a.append(['TEST_AUTH، النمسا', '2026-05-27', 'TEST_Product ONE', 'TEST_BATCH1', 'C1', '01.2023 / 12.2024',
              '02.2025 / 01.2027', 'instagram', 'note', 'S2'])
    s = wb.create_sheet('المصادر')
    s.append(si.PILOT_SOURCES)
    s.append(['S1', 'TEST ifu', 'الشركة المصنّعة', 'https://example.test/s1', '2026-11-09'])
    s.append(['S2', 'TEST reg', 'جهة رقابية', 'https://example.test/s2', '2026-11-09'])
    wb.save(path)
    return path


# ----------------------------------------------------------------------------- synthetic tests
def test_placeholders_become_null_and_candidates(conn, tmp_path):
    f = make_iqb(tmp_path / 'TEST_iqb.xlsx', [('TEST_IQB-0001', 'بانتظار مطابقة الاسم الرسمي', None),
                                               ('TEST_IQB-0002', 'TEST Official', 'https://example.test/w')])
    run(conn, si.import_iqb, f)
    rows = dict(q(conn, 'select external_ref, official_name from products'))
    assert rows == {'TEST_IQB-0001': None, 'TEST_IQB-0002': 'TEST Official'}
    assert q(conn, "select distinct verification_status::text from products") == [('candidate_unverified',)]
    assert q(conn, "select field, status::text from evidence") == [('official_name_witness', 'partial')]
    raw = q(conn, "select cells->>'الاسم بشاهد رسمي' from raw_import_rows where external_ref='TEST_IQB-0001' "
                  "and sheet='قائمة المنتجات'")
    assert raw == [('بانتظار مطابقة الاسم الرسمي',)]   # verbatim in raw rows


def test_reimport_same_file_is_noop(conn, tmp_path):
    f = make_iqb(tmp_path / 'TEST_iqb.xlsx', [('TEST_IQB-0001', 'X', None)])
    run(conn, si.import_iqb, f)
    assert 'already imported' in run(conn, si.import_iqb, f)
    assert q(conn, 'select count(*) from import_batches') == [(1,)]
    assert q(conn, 'select count(*) from listing_sources') == [(1,)]


def test_unknown_header_rejected(conn, tmp_path):
    bad = si.IQB_PRODUCTS[:-1] + ['عمود جديد']
    f = make_iqb(tmp_path / 'TEST_bad.xlsx', [('TEST_IQB-0001', 'X', None)], products_header=bad)
    with pytest.raises(si.ImportError_, match='unexpected header'):
        run(conn, si.import_iqb, f)
    assert q(conn, 'select count(*) from products') == [(0,)]


def test_value_outside_columns_rejected(conn, tmp_path):
    f = make_iqb(tmp_path / 'TEST_bad.xlsx', [('TEST_IQB-0001', 'X', None)], extra_cell='stray')
    with pytest.raises(si.ImportError_, match='outside known columns'):
        run(conn, si.import_iqb, f)


def test_pilot_then_iqb_keeps_pilot_official_name(conn, tmp_path):
    run(conn, si.import_pilot, make_pilot(tmp_path / 'TEST_pilot.xlsx'))
    run(conn, si.import_iqb, make_iqb(tmp_path / 'TEST_iqb.xlsx', [('TEST_IQB-0001', 'IQB name', None)]))
    assert q(conn, "select official_name from products") == [('TEST_Product® ONE',)]


def test_pilot_partial_not_counted_and_alert_dates(conn, tmp_path):
    run(conn, si.import_pilot, make_pilot(tmp_path / 'TEST_pilot.xlsx', lebanon='جزئي'))
    assert q(conn, 'select yes_count, documentation_status from v_documentation_status') == [(1, '⚠️ ناقص')]
    assert q(conn, "select verification_status::text from products") == [('candidate_unverified',)]
    assert q(conn, 'select gtin, gtin_status_text from product_variants') == [(None, 'غير متوفر رسمياً')]
    assert q(conn, 'select batch_as_published, alert_kind, counterfeit_exp, (product_id is not null) from alert_items') == \
        [('TEST_BATCH1', 'copied_genuine_batch', dt.date(2027, 1, 1), True)]
    assert q(conn, 'select country from regulatory_alerts') == [('AT',)]


def test_unknown_evidence_status_rejected(conn, tmp_path):
    with pytest.raises(si.ImportError_, match='unknown evidence status'):
        run(conn, si.import_pilot, make_pilot(tmp_path / 'TEST_pilot.xlsx', lebanon='ربما'))


def test_unknown_source_code_rejected(conn, tmp_path):
    with pytest.raises(si.ImportError_, match='unknown source codes'):
        run(conn, si.import_pilot, make_pilot(tmp_path / 'TEST_pilot.xlsx', cite='S9'))


def test_gtin_requires_source(conn):
    pid = q(conn, "insert into products (external_ref) values ('TEST_X') returning id")[0][0]
    with pytest.raises(psycopg.errors.CheckViolation):
        q(conn, "insert into product_variants (product_id, gtin) values (%s, '00000000000000')", pid)


def test_rls_hides_sellers_from_public(conn, tmp_path):
    run(conn, si.import_iqb, make_iqb(tmp_path / 'TEST_iqb.xlsx', [('TEST_IQB-0001', 'X', None)]))
    with conn.transaction():
        q(conn, 'set local role anon')
        assert q(conn, 'select count(*) from products') == [(1,)]
        assert q(conn, 'select count(*) from listing_sources') == [(0,)]
        assert q(conn, 'select count(*) from raw_import_rows') == [(0,)]
        assert q(conn, 'select count(*) from product_review_status') == [(0,)]
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            q(conn, "insert into products (external_ref) values ('TEST_hack')")


# ----------------------------------------------------------------------------- phase-1 acceptance on real files
def _find(pattern):
    hits = sorted(DATA.glob(pattern))
    assert len(hits) == 1, f'expected one file for {pattern} in {DATA}, found {hits}'
    return hits[0]


@pytest.mark.skipif(DATA is None, reason='SYN_DATA_DIR not set (real files are not committed)')
def test_acceptance_juvederm_exactly_as_file(conn):
    run(conn, si.import_iqb, _find('*Initial_Registry*.xlsx'))
    run(conn, si.import_iqb, _find('*Batch_2*.xlsx'))
    pilot = _find('*Pilot_JUVEDERM*.xlsx')
    run(conn, si.import_pilot, pilot)

    wb = openpyxl.load_workbook(pilot, data_only=True)
    _, rows = si.table(wb['المنتجات'], [si.PILOT_PRODUCTS])
    _, sources = si.table(wb['المصادر'], [si.PILOT_SOURCES])
    url_of = {s['الرمز']: s['الرابط'] for _, s in sources}
    assert len(rows) == 3

    for _, r in rows:
        ref = r['المعرّف']
        (name, status_file, count_file, computed), = q(conn, '''
            select p.official_name, p.documentation_status_file, p.documentation_count_file, v.documentation_status
            from products p join v_documentation_status v on v.product_id = p.id where p.external_ref = %s''', ref)
        assert name == r['الاسم الرسمي']
        assert status_file == r['حالة التوثيق'] == computed          # our rule reproduces the file's status
        assert count_file == r['عدد الأدلة الرسمية المطابقة']

        variant = q(conn, '''select package_text, concentration_text, origin_text, gtin, gtin_status_text,
                                    gs1_result_text, security_features_text, ifu_reference_text
                             from product_variants v join products p on p.id = v.product_id where p.external_ref = %s''', ref)
        assert variant == [(r['العبوة الرسمية'], r['التركيز'], r['بلد المنشأ / عنوان التصنيع'], None,
                            r['الباركود الرسمي'], r['نتيجة GS1'], r['علامات الأصالة والتتبّع'],
                            r['نشرة الاستعمال الرسمية'])]

        ev = {label: (status, urls) for label, status, urls in q(conn, '''
            select e.authority_label, e.status::text,
                   coalesce(array_agg(s.url order by s.url) filter (where s.url is not null), '{}')
            from evidence e join products p on p.id = e.product_id
            left join evidence_sources es on es.evidence_id = e.id left join sources s on s.id = es.source_id
            where p.external_ref = %s and e.field = 'product_evidence' group by 1, 2''', ref)}
        for col, _, text_col in si.PILOT_EVIDENCE:
            status, urls = ev[col]
            assert status == si.EVIDENCE_STATUS[r[col]]
            cited_text = r['نشرة الاستعمال الرسمية'] if col == 'دليل المصنّع' else (r[text_col] if text_col else '')
            assert urls == sorted(url_of[c] for c in set(si.source_codes(cited_text)))

    # alerts: batch numbers verbatim, both linked to ULTRA 4
    alerts = q(conn, '''select a.authority, i.batch_as_published, p.external_ref, i.genuine_dates_raw, i.counterfeit_dates_raw
                        from alert_items i join regulatory_alerts a on a.id = i.alert_id
                        left join products p on p.id = i.product_id order by a.alert_date''')
    _, arows = si.table(wb['الإنذارات الرقابية'], [si.PILOT_ALERTS])
    expected = sorted(((a['الجهة'], str(a['رقم التشغيلة كما نشرته الجهة']), 'IQB-0002',
                        a['الأصلي: تصنيع / انتهاء'], a['المقلد: تصنيع / انتهاء']) for _, a in arows),
                      key=lambda t: t[0] != 'AEMPS، إسبانيا')
    assert alerts == expected

    # whole registry
    assert q(conn, 'select count(*) from products') == [(1000,)]
    assert q(conn, "select count(*) from products where verification_status = 'verified'") == [(2,)]
    assert q(conn, 'select count(*) from product_variants where gtin is not null') == [(0,)]
