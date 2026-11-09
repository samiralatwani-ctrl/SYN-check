/**
 * Reference images for the EXPERIMENTAL packaging signal (CLAUDE.md §5.5, D-036).
 * Only photos of verified samples from the authorised agent, or manufacturer material whose use is permitted.
 * Never images from search engines or shops.
 *
 *   npx tsx tools/images/reference.mts add <external_ref> <image.jpg|png> --acquisition authorized_agent_sample|manufacturer_material \
 *        --source-url <url> [--view front|back|cap|batch_area|other]      -> prints SQL (review_status = pending)
 *   npx tsx tools/images/reference.mts approve <reference_image_id> --note "<who/why>"  -> prints SQL
 * Run the printed SQL with tools/deploy/sb_sql.py (Supabase) or psql (local).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { decodeImage, visualVector, VISUAL_VERSION } from '@syn/visual/src/server';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const [cmd, a, b] = process.argv.slice(2);

if (cmd === 'add' && a && b) {
  const acquisition = arg('--acquisition'), source = arg('--source-url'), view = arg('--view') ?? 'front';
  if (!['authorized_agent_sample', 'manufacturer_material'].includes(acquisition ?? '')) throw new Error('--acquisition must be authorized_agent_sample or manufacturer_material');
  if (!source?.startsWith('https://')) throw new Error('--source-url (https) is required: where the sample or material comes from');
  const bytes = readFileSync(b);
  const vec = visualVector(decodeImage(new Uint8Array(bytes)));
  const sha = createHash('sha256').update(bytes).digest('hex');
  console.log(`insert into sources (url, title, source_type, last_verified_at) values (${q(source)}, ${q('Reference image source')}, ${q(acquisition!)}, current_date) on conflict (url) do nothing;
insert into reference_images (variant_id, storage_path, view, acquisition, source_id, visual_vector, visual_version, image_sha256)
select v.id, ${q('sha256:' + sha)}, ${q(view)}, ${q(acquisition!)}, s.id, array[${vec.map((x) => x.toFixed(6)).join(',')}]::float8[], ${q(VISUAL_VERSION)}, ${q(sha)}
from product_variants v join products p on p.id = v.product_id, sources s
where p.external_ref = ${q(a)} and s.url = ${q(source)}
order by v.gtin nulls last limit 1
returning id, review_status;`);
} else if (cmd === 'approve' && a) {
  console.log(`update reference_images set review_status = 'approved', reviewed_at = now(), review_note = ${q(arg('--note') ?? 'approved')} where id = ${q(a)} and review_status = 'pending' returning id;`);
} else {
  console.error('usage: add <external_ref> <image> --acquisition <...> --source-url <url> [--view front] | approve <id> --note "<...>"');
  process.exit(2);
}
