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


def test_resolve_product_name_exact_only(conn):
    # accent, case, ® and spacing are ignored; partial names are not matched (we never pick a product for the user)
    assert anon(conn, "select external_ref from resolve_product_name('test_ juvederm', 'thing')") == [('TEST_1',)]
    assert anon(conn, "select external_ref from resolve_product_name(null, 'TEST_  Juvéderm Thing')") == [('TEST_1',)]
    assert anon(conn, "select external_ref from resolve_product_name('TEST_', 'Juvederm')") == []
    assert anon(conn, "select external_ref from resolve_product_name('x', '')") == []


def test_product_reference_has_variants_and_no_sellers(conn):
    (r,), = anon(conn, "select product_reference('TEST_1')")
    assert [v['external_ref'] for v in r['variants']] == ['TEST_1'] and r['alerts'] == []
    assert 'TEST_SELLER' not in str(r)


def test_extraction_log_is_private(conn):
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute('set local role anon')
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                cur.execute('select count(*) from label_extraction_log')


def _user(conn, uid):
    with conn.cursor() as cur:
        cur.execute('insert into auth.users (id) values (%s) on conflict do nothing', (uid,))


def as_user(conn, uid, sql, *a):
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute('set local role authenticated')
            cur.execute("select set_config('request.jwt.claim.sub', %s, true)", (uid,))
            cur.execute(sql, a)
            return cur.fetchall() if cur.description else None


def test_reports_are_private_to_their_owner(conn):
    a, b = '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'
    _user(conn, a); _user(conn, b)
    with conn.cursor() as cur:
        cur.execute("insert into method_versions (version, status, rules, rules_sha256) values ('TEST_v', 'rc', '{}', 'TEST_sha')")
    (sid,), = as_user(conn, a, "insert into scans (user_id, verdict, method_version, method_sha256) values (%s, 'mismatch', 'TEST_v', 'TEST_sha') returning id", a)
    as_user(conn, a, "insert into reports (scan_id, user_id, recipients, channel, message_text, seller_info_private) values (%s, %s, '{x@example.test}', 'email', 'TEST_', 'TEST_SELLER')", sid, a)
    assert as_user(conn, a, 'select seller_info_private from reports') == [('TEST_SELLER',)]
    assert as_user(conn, b, 'select count(*) from reports') == [(0,)]          # another user sees nothing
    assert anon(conn, 'select count(*) from reports') == [(0,)]
    with pytest.raises(psycopg.errors.InsufficientPrivilege):                  # cannot file a report as someone else
        as_user(conn, b, "insert into reports (scan_id, user_id, recipients) values (%s, %s, '{}')", sid, a)


def test_explore_and_report_contacts_hide_sellers(conn):
    (e,), = anon(conn, 'select explore()')
    assert set(e) == {'alerts', 'agents', 'verified'} and 'TEST_SELLER' not in str(e) and 'TEST_FIRMA' not in str(e)
    assert [v['external_ref'] for v in e['verified']] == ['TEST_1']
    (c,), = anon(conn, "select report_contacts('TEST_1')")
    assert c['brand'] is None and 'TEST_SELLER' not in str(c)
