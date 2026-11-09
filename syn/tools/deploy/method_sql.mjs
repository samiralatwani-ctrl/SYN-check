// Prints an idempotent INSERT for the embedded method (packages/rules-engine/src/method-v1.json).
import { readFileSync } from 'node:fs';
const m = JSON.parse(readFileSync(new URL('../../packages/rules-engine/src/method-v1.json', import.meta.url), 'utf8'));
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const status = m.status === 'published' ? 'published' : m.status?.startsWith('rc') ? 'rc' : 'draft';
console.log(`insert into method_versions (version, status, rules, rules_sha256) values (${q(m.version)}, ${q(status)}, ${q(JSON.stringify(m))}::jsonb, ${q(m.rules_sha256)}) on conflict (version, rules_sha256) do nothing;`);
