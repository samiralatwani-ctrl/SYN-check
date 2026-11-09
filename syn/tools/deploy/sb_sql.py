#!/usr/bin/env python3
"""Run SQL on the Supabase project through the Management API (POST /v1/projects/{ref}/database/query).
Authentication is added by the environment's network secret for api.supabase.com; no token is read here.

  python sb_sql.py --ref <project_ref> -c "select 1"
  python sb_sql.py --ref <project_ref> file1.sql file2.sql      # each file in one request (one transaction)
"""
import argparse, json, os, ssl, sys, urllib.request, urllib.error

def run(ref: str, query: str):
    ctx = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE') or None)
    req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/database/query',
                                 data=json.dumps({'query': query}).encode(), method='POST',
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=600) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors='replace')[:2000]

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', required=True)
    ap.add_argument('-c')
    ap.add_argument('files', nargs='*')
    a = ap.parse_args()
    jobs = [('-c', a.c)] if a.c else [(f, open(f, encoding='utf-8').read()) for f in a.files]
    for name, q in jobs:
        status, body = run(a.ref, q)
        print(f'{name}: HTTP {status}', json.dumps(body, ensure_ascii=False)[:1500] if not isinstance(body, str) else body)
        if status >= 300:
            sys.exit(1)
