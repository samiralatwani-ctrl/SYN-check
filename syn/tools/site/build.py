#!/usr/bin/env python3
"""Builds the public policy pages (docs/site/*.html) from docs/store/*.md. Re-run after editing the policies."""
from pathlib import Path
import markdown

ROOT = Path(__file__).resolve().parents[2]
PAGES = {'privacy': 'سياسة الخصوصية · Privacy policy', 'corrections': 'سياسة التصحيح والحياد · Corrections policy'}
CSS = """
:root{--bg:#f4f6f5;--card:#fff;--ink:#14201b;--muted:#5d6b65;--line:#dfe5e2;--brand:#0f6b52}
@media (prefers-color-scheme:dark){:root{--bg:#0f1513;--card:#18211e;--ink:#e8efec;--muted:#9aaba4;--line:#2a3632;--brand:#5fd0a8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 'IBM Plex Sans Arabic',system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px}section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:8px 20px;margin-bottom:20px}
h1{font-size:22px}h2{font-size:18px;margin-top:22px}a{color:var(--brand)}nav{display:flex;gap:14px;flex-wrap:wrap}
table{border-collapse:collapse;width:100%;font-size:14px;display:block;overflow-x:auto}th,td{border-bottom:1px solid var(--line);padding:6px;text-align:start;vertical-align:top}
"""
for name, title in PAGES.items():
    parts = []
    for lang, d in (('ar', 'rtl'), ('en', 'ltr')):
        md = (ROOT / 'docs' / 'store' / f'{name}-{lang}.md').read_text(encoding='utf-8')
        parts.append(f'<section lang="{lang}" dir="{d}">{markdown.markdown(md, extensions=["tables"])}</section>')
    nav = '<nav><a href="privacy.html">Privacy · الخصوصية</a><a href="corrections.html">Corrections · التصحيح</a></nav>'
    html = (f'<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>SYN · {title}</title><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600&display=swap" rel="stylesheet">'
            f'<style>{CSS}</style></head><body><main>{nav}{"".join(parts)}</main></body></html>\n')
    (ROOT / 'docs' / 'site' / f'{name}.html').write_text(html, encoding='utf-8')
    print('wrote', f'docs/site/{name}.html')
