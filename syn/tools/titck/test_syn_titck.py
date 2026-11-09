"""TİTCK program tests. All data here is synthetic (TEST_); no network access."""
import datetime as dt
import io
import os
import subprocess
from pathlib import Path

import openpyxl
import psycopg
import pytest

import syn_titck as t

RESET = Path(__file__).resolve().parents[2] / 'supabase' / 'tests' / 'reset_local.sh'
DB_URL = os.environ.get('SYN_TEST_DB_URL', 'postgresql://syn:syn@localhost/syn_test')
URL = 'https://www.titck.gov.tr/dinamikmodul/113'


def page(rows, header=t.UNSAFE_HEADER):
    tr = lambda cells, tag: '<tr>' + ''.join(f'<{tag}>{c}</{tag}>' for c in cells) + '</tr>'
    body = tr(header, 'th') + ''.join(tr(r, 'td') for r in rows)
    return f'<html><body><table><tr><td>menu</td></tr></table><table>{body}</table></body></html>'.encode()


ROW_A = ['TEST_FİRMA A.Ş.', '4670220302107 Barkod Numaralı TEST_Krem 50 ml', 'Tüm seriler', 'Türkiye',
         'TEST_ gerekçe', '01/10/2026']
ROW_B = ['TEST_FİRMA B', 'TEST_Sabun 1000 ml', 'NobEl-V2-08/22', 'Türkiye', 'TEST_', '15/03/2025']


# ----------------------------------------------------------------------------- pure functions
@pytest.mark.parametrize('text,scope', [
    ('Tüm seriler', 'all_batches'), ('Bütün Seriler', 'all_batches'), ('Seri No: Tüm seriler', 'all_batches'),
    ('TÜM SERİLER', 'all_batches'), ('Ambalajda seri no belirtilmemiş', 'not_on_pack'),
    ('Seri no bulunmamaktadır.', 'not_on_pack'), ('İlgili seriler', 'unspecified'), ('', 'unspecified'),
    ('146', 'specific'), ('NobEl-V2-08/22', 'specific')])
def test_lot_scope(text, scope):
    assert t.lot_scope(text) == scope


@pytest.mark.parametrize('text,gtin', [
    ('4670220302107 Barkod Numaralı X', '04670220302107'),     # valid EAN-13
    ('4670220302108 Barkod Numaralı X', None),                 # bad check digit -> never stored
    ('4670220302107 numaralı X', None),                        # no 'Barkod' word -> not assumed to be a barcode
    ('BARKOD: 4670220302107 ve 8683347816125', None),          # two numbers -> ambiguous -> nothing
    ('TEST_Sabun 1000 ml', None)])
def test_gtin_in_text(text, gtin):
    assert t.gtin_in_text(text) == gtin


def test_dates_and_duplicate_keys():
    assert t.parse_tr_date('01/10/2026') == dt.date(2026, 10, 1)
    assert t.parse_tr_date('2026-10-01') is None
    k = t.row_keys([ROW_A, ROW_A, ROW_B])
    assert len(set(k)) == 3 and k[0].endswith('#1') and k[1].endswith('#2')


def test_header_change_rejected():
    with pytest.raises(t.TitckError, match='expected header'):
        t.parse_unsafe_html(page([ROW_A], header=t.UNSAFE_HEADER[:-1] + ['Tarih']))


def test_gmp_parse():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append([None, 'GMP SERTİFİKASI VERİLEN FİRMALAR'])
    ws.append([None, None] + t.GMP_HEADER)
    ws.append([None, 1, 'TEST_KOZMETİK A.Ş.', 'KOCAELİ', dt.datetime(2023, 12, 21), dt.datetime(2026, 12, 21)])
    buf = io.BytesIO(); wb.save(buf)
    assert t.parse_gmp_xlsx(buf.getvalue()) == [['TEST_KOZMETİK A.Ş.', 'KOCAELİ', dt.datetime(2023, 12, 21),
                                                 dt.datetime(2026, 12, 21)]]


# ----------------------------------------------------------------------------- database
@pytest.fixture
def conn():
    subprocess.run([str(RESET)], check=True, env={**os.environ, 'SYN_DB_URL': DB_URL}, capture_output=True)
    with psycopg.connect(DB_URL, autocommit=True) as c:
        yield c


def q(conn, sql, *a):
    with conn.cursor() as cur:
        cur.execute(sql, a)
        return cur.fetchall() if cur.description else None


def store(conn, content):
    with conn.transaction():
        return t.store_unsafe(conn, URL, 200, content)


def test_store_provenance_unchanged_and_removed(conn):
    assert '2 new' in store(conn, page([ROW_A, ROW_B]))
    assert 'unchanged' in store(conn, page([ROW_A, ROW_B]))
    assert q(conn, 'select count(*) from titck.fetches') == [(1,)]
    # every row is traceable to the fetch (URL + hash + original bytes)
    assert q(conn, 'select f.url, length(f.content) > 0 from titck.unsafe_cosmetics u '
                   'join titck.fetches f on f.id = u.first_fetch_id limit 1') == [(URL, True)]
    # a later page without ROW_B marks it as removed, keeps it for history
    assert '0 new, 1 no longer listed' in store(conn, page([ROW_A]))
    assert q(conn, "select lot_text, removed_from_list_at is not null from titck.unsafe_cosmetics order by lot_text") == \
        [('NobEl-V2-08/22', True), ('Tüm seriler', False)]
    assert q(conn, "select gtin_in_text, lot_scope, decision_date from titck.unsafe_cosmetics where lot_text = 'Tüm seriler'") == \
        [('04670220302107', 'all_batches', dt.date(2026, 10, 1))]


def test_titck_raw_tables_hidden_from_public(conn):
    # Owner decision D-021 (update): facts are published through lookup_gtin(); the raw schema
    # (company names, original pages) stays staff-only regardless.
    store(conn, page([ROW_A]))
    assert q(conn, 'select publish_enabled, decided_by from titck.settings') == [(True, 'owner')]
    with conn.transaction():
        q(conn, 'set local role anon')
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            q(conn, 'select count(*) from titck.unsafe_cosmetics')
