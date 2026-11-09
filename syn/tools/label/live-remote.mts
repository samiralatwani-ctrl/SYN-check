/**
 * LIVE end-to-end check against the deployed Supabase project (costs one label read).
 *   NODE_USE_ENV_PROXY=1 npx tsx tools/label/live-remote.mts
 * Synthetic label (marked TEST SAMPLE) with the batch of the BASG alert and the counterfeit dates
 * -> extract-label function (Claude) -> resolve_product_name / product_reference -> rules engine.
 */
import { createRequire } from 'node:module';
import { evaluate } from '@syn/rules-engine';
import { buildScan, type Reference } from '@syn/scan-signals';

const URL_ = process.env.SYN_SUPABASE_URL ?? 'https://lommcwfzmbfbeyafymzf.supabase.co';
const KEY = process.env.SYN_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_QRa2AmSm31_qCd3p2DiEoQ_fmzfXPTW';
const require = createRequire(import.meta.url);

async function renderLabel(): Promise<string> {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 560 } });
  await p.setContent(`<body style="margin:0;font-family:Arial;background:#f4f4f4">
    <div style="margin:30px;padding:28px;background:#fff;border:2px solid #333;border-radius:8px">
      <div style="color:#b00;font-weight:bold;font-size:18px">TEST SAMPLE — NOT A REAL PRODUCT</div>
      <div style="font-size:40px;font-weight:bold;margin-top:12px">Juvéderm® ULTRA 4</div>
      <div style="font-size:20px">Hyaluronic acid 24 mg/ml · Lidocaine 3 mg/ml · 2 x 1 ml</div>
      <div style="font-size:26px;margin-top:22px;font-family:monospace">LOT 1005654957</div>
      <div style="font-size:26px;font-family:monospace">MFG 02.2025 &nbsp;&nbsp; EXP 01.2027</div>
    </div></body>`);
  const png: Buffer = await p.screenshot();
  await b.close();
  return png.toString('base64');
}

const post = async (path: string, body: unknown, token?: string) => {
  const r = await fetch(`${URL_}${path}`, { method: 'POST', body: JSON.stringify(body),
    headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
};

const t0 = Date.now();
const { access_token } = await post('/auth/v1/signup', {});           // anonymous user
const result = await post('/functions/v1/extract-label', { image_base64: await renderLabel(), media_type: 'image/png' }, access_token);
const f = result.extraction.fields;
console.log('read:', JSON.stringify({ brand: f.brand_name.value, product: f.product_name.value, batch: f.batch.value,
  mfg: f.manufacture_date.value, exp: f.expiry_date.value, conf: { batch: f.batch.confidence, exp: f.expiry_date.confidence },
  model: result.meta.served_by, visual: result.visual ? `${result.visual.version} x${result.visual.vector.length}` : null, corrections: result.corrections, seconds: (Date.now() - t0) / 1000 }));

const matches = await post('/rest/v1/rpc/resolve_product_name', { p_brand: f.brand_name.value, p_name: f.product_name.value });
console.log('product:', matches.map((m: { external_ref: string }) => m.external_ref));
const ref: Reference = await post('/rest/v1/rpc/product_reference', { p_external_ref: matches[0].external_ref });

const confirmed = { product_name: { value: f.product_name.value }, batch: { value: f.batch.value },
  manufacture_date: { value: f.manufacture_date.value.iso }, expiry_date: { value: f.expiry_date.value.iso } };
const today = new Date().toISOString().slice(0, 10);
const before = evaluate(buildScan({ label: { extraction: result.extraction, confirmed: {} }, reference: ref, identifiedBy: 'label_name', today }).input);
const after = evaluate(buildScan({ label: { extraction: result.extraction, confirmed }, reference: ref, identifiedBy: 'label_name', today }).input);
console.log('verdict before user confirmation:', before.verdict, before.step);
console.log('verdict after  user confirmation:', after.verdict, after.step, after.annotations.join(','));
process.exit(after.verdict === 'mismatch' ? 0 : 1);
