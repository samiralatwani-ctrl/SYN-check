/**
 * Official ingredient lists (CLAUDE.md §5.4, D-028).
 *
 *   npx tsx tools/inci/formula.mts extract <external_ref> <official_url>   -> review/formulas/<ref>.json (candidates)
 *   npx tsx tools/inci/formula.mts import  review/formulas/<ref>.json      -> formula_versions (review_status=pending)
 *   npx tsx tools/inci/formula.mts approve <external_ref> --by "<name>"    -> pending -> approved
 *
 * The page is fetched once, its SHA-256 kept, and the list stored exactly as published (raw_text) plus the
 * parsed INCI names. A list counts in verdicts only after a person approves it.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIngredientList } from '@syn/inci';
import postgres from 'postgres';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOL = 'syn-inci-formula/1';
const UA = 'SYN-CheckBeforeUse-research/0.1 (consumer-safety reference; low-frequency)';

export interface ReviewFile {
  external_ref: string;
  source_url: string;
  source_title: string | null;
  fetched_at: string;
  page_sha256: string;
  candidates: string[];       // every block on the page that looks like an ingredient list
  selected: number | null;    // index chosen by the reviewer (pre-filled with the best guess)
  raw_text: string | null;    // the chosen list exactly as published
  items: string[];            // parsed INCI names (for reading only; recomputed on import)
  may_contain: string[];
  actives: string[];          // declared active substances; filled by the reviewer only
  review_note: string;
}

/** Text blocks that start with an ingredients heading and contain a comma-separated list. */
export function findCandidates(html: string): { title: string | null; blocks: string[] } {
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
  const text = html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
  const blocks = new Set<string>();
  const re = /(?:ingredients?|INCI|composition)\s*:?\s*/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 4000);
    // a list ends at the first sentence-like break after the last comma-separated item
    const end = rest.search(/\.\s+[A-Z][a-z]{2,}\s[a-z]|\s{2,}|(?:Clinically|How to use|Directions|Benefits|Warnings?)\b/);
    const block = (end > 0 ? rest.slice(0, end + 1) : rest.slice(0, 1500)).trim().replace(/^(?:list|full list|ingredients?)\s*:?\s*/i, '')
      .split(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}?!]/u)[0].trim();   // page text after the list (emoji, questions)
    if (block.length < 3500 && inciScore(block) >= 0.85) blocks.add(block);
  }
  return { title, blocks: [...blocks].sort((a, b) => inciScore(b) - inciScore(a) || b.split(',').length - a.split(',').length) };
}

const PROSE = /\b(the|and|to|for|with|your|our|that|this|helps?|skin|formula|discover|add|view|now|is|are|of)\b/i;
/** Share of comma-separated items that look like INCI names (short, no prose words). 0 for fewer than 6 items. */
export function inciScore(block: string): number {
  const items = block.split(',').map((x) => x.trim()).filter(Boolean);
  if (items.length < 6) return 0;
  const ok = items.filter((x) => x.split(/\s+/).length <= 6 && x.length <= 80 && !PROSE.test(x.replace(/\(.*?\)/g, ''))).length;
  return ok / items.length;
}

async function extract(ref: string, url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const html = await res.text();
  const { title, blocks } = findCandidates(html);
  const best = blocks[0] ?? null;
  const parsed = best ? parseIngredientList(best) : { items: [], mayContain: [] };
  const review: ReviewFile = {
    external_ref: ref, source_url: url, source_title: title, fetched_at: new Date().toISOString(),
    page_sha256: createHash('sha256').update(html).digest('hex'), candidates: blocks, selected: best ? 0 : null,
    raw_text: best, items: parsed.items, may_contain: parsed.mayContain, actives: [], review_note: '',
  };
  const out = join(ROOT, 'review', 'formulas', `${ref}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(review, null, 2) + '\n');
  console.log(`${ref}: ${blocks.length} candidate list(s); best has ${parsed.items.length} items -> ${out}`);
}

async function importFile(file: string, sql: postgres.Sql) {
  const r = JSON.parse(readFileSync(file, 'utf8')) as ReviewFile;
  if (r.selected == null || !r.raw_text) throw new Error(`${file}: no list selected`);
  if (r.raw_text !== r.candidates[r.selected]) throw new Error(`${file}: raw_text must equal the selected candidate exactly`);
  const parsed = parseIngredientList(r.raw_text);
  await sql.begin(async (tx) => {
    const [p] = await tx`select id, verification_status from products where external_ref = ${r.external_ref}`;
    if (!p) throw new Error(`${r.external_ref}: unknown product`);
    const [src] = await tx`insert into sources (url, title, source_type, last_verified_at)
      values (${r.source_url}, ${r.source_title}, 'الشركة المصنّعة', ${r.fetched_at.slice(0, 10)})
      on conflict (url) do update set last_verified_at = excluded.last_verified_at returning id`;
    let [variant] = await tx`select id from product_variants where product_id = ${p.id} order by gtin nulls last limit 1`;
    if (!variant) [variant] = await tx`insert into product_variants (product_id, verification_status) values (${p.id}, ${p.verification_status}) returning id`;
    const [dup] = await tx`select id from formula_versions where variant_id = ${variant.id} and page_sha256 = ${r.page_sha256}`;
    if (dup) { console.log(`${r.external_ref}: already imported from this page version`); return; }
    const [fv] = await tx`insert into formula_versions (variant_id, valid_from, source_id, source_date, raw_text, fetched_at, page_sha256, extracted_by)
      values (${variant.id}, ${r.fetched_at.slice(0, 10)}, ${src.id}, ${r.fetched_at.slice(0, 10)}, ${r.raw_text}, ${r.fetched_at}, ${r.page_sha256}, ${TOOL})
      returning id`;
    const actives = new Set(r.actives.map((a) => a.toUpperCase()));
    for (const [i, name] of [...parsed.items].entries()) {
      const [ing] = await tx`insert into ingredients (inci_name, is_active_substance, created_from) values (${name}, ${actives.has(name)}, ${'formula:' + fv.id})
        on conflict (inci_name) do update set is_active_substance = ingredients.is_active_substance or excluded.is_active_substance returning id`;
      await tx`insert into variant_ingredients (formula_version_id, ingredient_id, position) values (${fv.id}, ${ing.id}, ${i + 1})`;
    }
    console.log(`${r.external_ref}: imported ${parsed.items.length} ingredients as PENDING review (formula ${fv.id})`);
  });
}

async function approve(ref: string, by: string, sql: postgres.Sql) {
  const rows = await sql`update formula_versions fv set review_status = 'approved', reviewed_at = now(), review_note = ${'approved by ' + by}
    from product_variants v join products p on p.id = v.product_id
    where fv.variant_id = v.id and p.external_ref = ${ref} and fv.review_status = 'pending' returning fv.id`;
  console.log(`${ref}: ${rows.length} formula version(s) approved by ${by}`);
}

const [cmd, a, b, ...rest] = process.argv.slice(2);
if (process.env.VITEST) { /* imported by tests */ } else
{
const dbUrl = process.env.SYN_DB_URL ?? 'postgresql://syn:syn@localhost/syn';
if (cmd === 'extract' && a && b) await extract(a, b);
else if (cmd === 'import' && a) { const sql = postgres(dbUrl, { max: 1 }); await importFile(a, sql); await sql.end(); }
else if (cmd === 'approve' && a && b === '--by' && rest[0]) { const sql = postgres(dbUrl, { max: 1 }); await approve(a, rest[0], sql); await sql.end(); }
else if (cmd) { console.error('usage: extract <ref> <url> | import <file> | approve <ref> --by <name>'); process.exit(2); }
}
