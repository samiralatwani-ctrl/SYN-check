// Compiles method/v1/rules.yaml into src/method-v1.json (embedded in the app) with its SHA-256.
// --check fails if the embedded JSON is out of date, so the app can never ship stale rules.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = new URL('../../../', import.meta.url);
const src = readFileSync(new URL('method/v1/rules.yaml', root), 'utf8');
const out = fileURLToPath(new URL('../src/method-v1.json', import.meta.url));
const json = JSON.stringify({ ...parse(src), rules_sha256: createHash('sha256').update(src).digest('hex') }, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!existsSync(out) || readFileSync(out, 'utf8') !== json) {
    console.error('src/method-v1.json is out of date: run `npm run build:method`'); process.exit(1);
  }
} else writeFileSync(out, json);
