#!/usr/bin/env python3
"""TİTCK data program: fetches two public TİTCK lists into the separate `titck` schema.

  * cosmetic_unsafe : Kozmetik Güvensiz Ürünler Listesi  (https://www.titck.gov.tr/dinamikmodul/113)
  * cosmetic_gmp    : GMP Sertifikası Verilen Kozmetik Üretim Tesisleri (xlsx linked from the TİTCK home page)

Rules:
  * Every stored row points to the fetch it came from; each fetch keeps URL, time, HTTP status, SHA-256 and the
    original bytes. Nothing is published to the app from here (see D-021).
  * Text cells are stored verbatim. Derived fields are limited to: decision date (dd/mm/yyyy), lot scope
    (from fixed phrases) and a GTIN only when the text says 'Barkod' and the digits pass the GS1 check digit.
  * One polite request per list per run. An unchanged page (same SHA-256 as the last fetch) stores nothing new.
  * If a page's table header changes, the run stops instead of guessing.

Usage:
  python syn_titck.py --db postgresql://... fetch [--list cosmetic_unsafe|cosmetic_gmp|all]
  python syn_titck.py --db postgresql://... load --list cosmetic_unsafe --file page.html --url https://...
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import os
import re
import sys
import urllib.request
from html.parser import HTMLParser

import openpyxl
import psycopg

PARSER_VERSION = 'titck-1'
UA = 'SYN-CheckBeforeUse-research/0.1 (consumer-safety reference; low-frequency)'
HOME_URL = 'https://www.titck.gov.tr/'
UNSAFE_URL = 'https://www.titck.gov.tr/dinamikmodul/113'
UNSAFE_HEADER = ['Firma/Ürün Sahibi Adı', 'Ürün', 'Lot No/ Seri No', 'Menşei',
                 'Güvensizlik Gerekçesi, Uygulanan İdari Yaptırım', 'Tarihi']
GMP_HEADER = ['FİRMA ADI', 'İLİ', 'SERTİFİKA TARİHİ', 'SERTİFİKA GEÇERLİLİK SÜRESİ']


class TitckError(Exception):
    pass


# ----------------------------------------------------------------------------- pure helpers
def tr_lower(s: str) -> str:
    return s.replace('İ', 'i').replace('I', 'ı').lower()


def gs1_check_ok(digits: str) -> bool:
    if not digits.isdigit() or len(digits) not in (8, 12, 13, 14):
        return False
    body, check = digits[:-1], int(digits[-1])
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def gtin_in_text(text: str) -> str | None:
    """GTIN-14 only if the text explicitly says 'Barkod' and exactly one valid GS1 number is present."""
    if 'barkod' not in tr_lower(text):
        return None
    hits = {d for d in re.findall(r'(?<!\d)(\d{8}|\d{12,14})(?!\d)', text) if gs1_check_ok(d)}
    return hits.pop().zfill(14) if len(hits) == 1 else None


def lot_scope(text: str) -> str:
    t = tr_lower(text.strip())
    if not t or 'ilgili seri' in t:
        return 'unspecified'
    if 'tüm seri' in t or 'bütün seri' in t:
        return 'all_batches'
    if 'belirtilmemiş' in t or 'bulunmamaktadır' in t:
        return 'not_on_pack'
    return 'specific'


def parse_tr_date(text: str) -> dt.date | None:
    m = re.fullmatch(r'\s*(\d{2})/(\d{2})/(\d{4})\s*', text or '')
    return dt.date(int(m[3]), int(m[2]), int(m[1])) if m else None


def row_keys(rows: list[list[str]]) -> list[str]:
    seen: dict[str, int] = {}
    keys = []
    for r in rows:
        h = hashlib.sha256('\x1f'.join(r).encode()).hexdigest()
        seen[h] = seen.get(h, 0) + 1
        keys.append(f'{h}#{seen[h]}')
    return keys


class _Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self._row, self._cell, self._depth = [], None, None, 0

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.tables.append([])
        elif tag == 'tr' and self.tables:
            self._row = []
        elif tag in ('td', 'th') and self._row is not None:
            self._cell = []
        elif tag == 'br' and self._cell is not None:
            self._cell.append(' ')

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self._cell is not None:
            self._row.append(re.sub(r'\s+', ' ', ''.join(self._cell)).strip())
            self._cell = None
        elif tag == 'tr' and self._row is not None:
            if self._row:
                self.tables[-1].append(self._row)
            self._row = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


def parse_unsafe_html(content: bytes) -> list[list[str]]:
    p = _Tables()
    p.feed(content.decode('utf-8', errors='replace'))
    for t in p.tables:
        if t and t[0] == UNSAFE_HEADER:
            rows = t[1:]
            bad = [r for r in rows if len(r) != len(UNSAFE_HEADER)]
            if bad:
                raise TitckError(f'{len(bad)} rows do not have {len(UNSAFE_HEADER)} cells, e.g. {bad[0]}')
            return rows
    raise TitckError('unsafe-cosmetics table with the expected header not found (page layout changed?)')


def parse_gmp_xlsx(content: bytes) -> list[list]:
    ws = openpyxl.load_workbook(io.BytesIO(content), data_only=True).worksheets[0]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    for i, r in enumerate(rows):
        cells = [str(c).strip() if c is not None else None for c in r]
        if 'FİRMA ADI' in cells:
            start = cells.index('FİRMA ADI')
            if cells[start:start + 4] != GMP_HEADER:
                raise TitckError(f'GMP header changed: {cells}')
            out = []
            for r2 in rows[i + 1:]:
                vals = r2[start:start + 4]
                if vals[0] is None:
                    continue
                out.append(vals)
            return out
    raise TitckError('GMP header row not found')


def discover_gmp_url(home_html: bytes) -> str:
    for href, text in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', home_html.decode('utf-8', 'replace'), re.S):
        t = tr_lower(re.sub(r'<[^>]+>', ' ', text))
        if 'gmp sertifika' in t and 'kozmetik' in t and href.lower().endswith('.xlsx'):
            return urllib.request.quote(href, safe=':/()%')
    raise TitckError('GMP list link not found on the TİTCK home page')


# ----------------------------------------------------------------------------- network
def http_get(url: str) -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.status, r.read()


# ----------------------------------------------------------------------------- storage
def _new_fetch(cur, list_code, url, status, content, n):
    digest = hashlib.sha256(content).hexdigest()
    cur.execute('select sha256 from titck.fetches where list_code = %s order by fetched_at desc limit 1', (list_code,))
    last = cur.fetchone()
    if last and last[0] == digest:
        return None
    cur.execute('insert into titck.fetches (list_code, url, http_status, sha256, content, row_count, parser_version) '
                'values (%s,%s,%s,%s,%s,%s,%s) returning id', (list_code, url, status, digest, content, n, PARSER_VERSION))
    return cur.fetchone()[0]


def _mark_removed(cur, table, fetch_id):
    cur.execute(f'update titck.{table} set removed_from_list_at = now() '
                f'where last_fetch_id <> %s and removed_from_list_at is null', (fetch_id,))
    return cur.rowcount


def store_unsafe(conn, url, status, content) -> str:
    rows = parse_unsafe_html(content)
    with conn.cursor() as cur:
        fid = _new_fetch(cur, 'cosmetic_unsafe', url, status, content, len(rows))
        if fid is None:
            return f'cosmetic_unsafe: unchanged since last fetch ({len(rows)} rows)'
        new = 0
        for key, (company, product, lot, origin, reason, date_text) in zip(row_keys(rows), rows):
            cur.execute(
                'insert into titck.unsafe_cosmetics (row_key, company, product_text, lot_text, origin_text, reason_text, '
                'decision_date_text, decision_date, lot_scope, gtin_in_text, first_fetch_id, last_fetch_id) '
                'values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict (row_key) do update set '
                'last_fetch_id = excluded.last_fetch_id, removed_from_list_at = null returning (xmax = 0)',
                (key, company, product, lot, origin or None, reason or None, date_text, parse_tr_date(date_text),
                 lot_scope(lot), gtin_in_text(product), fid, fid))
            new += cur.fetchone()[0]
        removed = _mark_removed(cur, 'unsafe_cosmetics', fid)
    return f'cosmetic_unsafe: {len(rows)} rows on page, {new} new, {removed} no longer listed'


def store_gmp(conn, url, status, content) -> str:
    rows = parse_gmp_xlsx(content)
    as_date = lambda v: v.date() if isinstance(v, dt.datetime) else v
    with conn.cursor() as cur:
        fid = _new_fetch(cur, 'cosmetic_gmp', url, status, content, len(rows))
        if fid is None:
            return f'cosmetic_gmp: unchanged since last fetch ({len(rows)} rows)'
        texts = [[str(c) if c is not None else '' for c in r] for r in rows]
        new = 0
        for key, (company, city, cert, valid) in zip(row_keys(texts), rows):
            cur.execute(
                'insert into titck.cosmetic_gmp_facilities (row_key, company, city, certificate_date, valid_until, '
                'first_fetch_id, last_fetch_id) values (%s,%s,%s,%s,%s,%s,%s) on conflict (row_key) do update set '
                'last_fetch_id = excluded.last_fetch_id, removed_from_list_at = null returning (xmax = 0)',
                (key, str(company).strip(), city, as_date(cert), as_date(valid), fid, fid))
            new += cur.fetchone()[0]
        removed = _mark_removed(cur, 'cosmetic_gmp_facilities', fid)
    return f'cosmetic_gmp: {len(rows)} facilities, {new} new, {removed} no longer listed'


# ----------------------------------------------------------------------------- cli
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--db', default=os.environ.get('SYN_DB_URL'), required=os.environ.get('SYN_DB_URL') is None)
    sub = ap.add_subparsers(dest='cmd', required=True)
    f = sub.add_parser('fetch', help='download from titck.gov.tr')
    f.add_argument('--list', choices=['cosmetic_unsafe', 'cosmetic_gmp', 'all'], default='all')
    l = sub.add_parser('load', help='load a saved page/file (offline)')
    l.add_argument('--list', choices=['cosmetic_unsafe', 'cosmetic_gmp'], required=True)
    l.add_argument('--file', required=True)
    l.add_argument('--url', required=True, help='the URL the file was downloaded from (stored as its source)')
    a = ap.parse_args(argv)

    jobs = []
    if a.cmd == 'load':
        jobs.append((a.list, a.url, None, open(a.file, 'rb').read()))
    else:
        if a.list in ('cosmetic_unsafe', 'all'):
            jobs.append(('cosmetic_unsafe', UNSAFE_URL, *http_get(UNSAFE_URL)))
        if a.list in ('cosmetic_gmp', 'all'):
            gmp_url = discover_gmp_url(http_get(HOME_URL)[1])
            jobs.append(('cosmetic_gmp', gmp_url, *http_get(gmp_url)))
    store = {'cosmetic_unsafe': store_unsafe, 'cosmetic_gmp': store_gmp}
    with psycopg.connect(a.db) as conn:
        for code, url, status, content in jobs:
            try:
                with conn.transaction():
                    print(store[code](conn, url, status, content))
            except TitckError as e:
                print(f'{code}: REJECTED — {e}', file=sys.stderr)
                return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
