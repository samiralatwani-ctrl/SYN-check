"""Public lookup RPCs (phase 2). Synthetic TEST_ rows only. Run: pytest supabase/tests -q"""
import os
import subprocess
from pathlib import Path

import psycopg
import pytest

RESET = Path(__file__).with_name('reset_local.sh')
DB_URL = os.environ.get('SYN_TEST_DB_URL', 'postgresql://syn:syn@localhost/syn_test')


@pytest.fixture
def conn():
    subprocess.run([str(RESET)], check=True, env={**os.environ, 'SYN_DB_URL': DB_URL}, capture_output=True)
    with psycopg.connect(DB_URL, autocommit=True) as c:
        with c.cursor() as cur:
            cur.execute("insert into sources (url, title) values ('https://example.test/gtin', 'TEST_ src') returning id")
            sid = cur.fetchone()[0]
            cur.execute("insert into products (external_ref, official_name, verification_status) values "
                        "('TEST_1', 'TEST_ Juvéderm® Thing', 'verified') returning id")
            pid = cur.fetchone()[0]
            cur.execute("insert into product_variants (product_id, gtin, gtin_source_id, verification_status) "
                        "values (%s, '04006381333931', %s, 'verified')", (pid, sid))
            cur.execute("with b as (insert into import_batches (kind, file_name, sha256, row_count) values ('iqb','TEST','TEST',0) returning id) "
                        "insert into listing_sources (product_id, batch_id, seller_name) select %s, id, 'TEST_SELLER' from b", (pid,))
            cur.execute("insert into titck.fetches (list_code, url, sha256, content, row_count, parser_version) values "
                        "('cosmetic_unsafe', 'https://www.titck.gov.tr/dinamikmodul/113', 'x', 'x', 1, 't') returning id")
            fid = cur.fetchone()[0]
            cur.execute("insert into titck.unsafe_cosmetics (row_key, company, product_text, lot_text, decision_date_text, "
                        "lot_scope, gtin_in_text, first_fetch_id, last_fetch_id) values ('k', 'TEST_FIRMA', 'TEST_ ürün', "
                        "'Tüm seriler', '01/10/2026', 'all_batches', '04670220302107', %s, %s)", (fid, fid))
        yield c


def anon(conn, sql, *a):
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute('set local role anon')
            cur.execute(sql, a)
            return cur.fetchall()


def test_lookup_known_gtin(conn):
    (r,), = anon(conn, "select lookup_gtin('04006381333931')")
    assert [v['external_ref'] for v in r['variants']] == ['TEST_1']
    assert r['variants'][0]['gtin_source']['url'] == 'https://example.test/gtin'
    assert 'TEST_SELLER' not in str(r)


def test_lookup_unknown_gtin_is_empty(conn):
    (r,), = anon(conn, "select lookup_gtin('05901234123457')")
    assert r == {'gtin': '05901234123457', 'variants': [], 'alerts': []}


def test_titck_alert_exposes_facts_not_company(conn):
    (r,), = anon(conn, "select lookup_gtin('04670220302107')")
    (a,) = r['alerts']
    assert a['authority'] == 'TİTCK' and a['lot_scope'] == 'all_batches' and a['source_url'].startswith('https://www.titck.gov.tr')
    assert 'TEST_FIRMA' not in str(r)


def test_titck_alerts_hidden_when_publishing_disabled(conn):
    with conn.cursor() as cur:
        cur.execute('update titck.settings set publish_enabled = false')
    (r,), = anon(conn, "select lookup_gtin('04670220302107')")
    assert r['alerts'] == []


def test_search_is_accent_insensitive_and_never_searches_sellers(conn):
    assert anon(conn, "select external_ref from search_products('juvederm')") == [('TEST_1',)]
    assert anon(conn, "select external_ref from search_products('TEST_SELLER')") == []
    assert anon(conn, "select external_ref from search_products('j')") == []
