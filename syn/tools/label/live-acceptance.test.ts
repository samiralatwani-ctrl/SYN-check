/**
 * LIVE phase-3 acceptance (costs one Claude API call). Skipped unless ANTHROPIC_API_KEY is set.
 *   ANTHROPIC_API_KEY=... SYN_DB_URL=postgresql://... npx vitest run tools/label
 * Renders a synthetic label (clearly marked TEST SAMPLE) carrying the batch from the real BASG alert with the
 * counterfeit dates, reads it with Claude, confirms the read values as a user would, resolves the product in the
 * database, and expects the rules engine to return "mismatch".
 */
import Anthropic from '@anthropic-ai/sdk';
import { extractLabel } from '@syn/label-extraction/src/server';
import { evaluate } from '@syn/rules-engine';
import { buildScan, type Reference } from '@syn/scan-signals';
import { createRequire } from 'node:module';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

const live = !!process.env.ANTHROPIC_API_KEY;
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

describe.skipIf(!live)('LIVE phase 3 acceptance', () => {
  it('alerted batch + counterfeit dates read from a photo -> mismatch', async () => {
    const { extraction, meta } = await extractLabel(new Anthropic(), await renderLabel(), 'image/png');
    const f = extraction.fields;
    console.log(JSON.stringify({ meta, product: f.product_name.value, brand: f.brand_name.value, batch: f.batch.value,
      mfg: f.manufacture_date.value, exp: f.expiry_date.value }, null, 2));

    const sql = postgres(process.env.SYN_DB_URL ?? 'postgresql://syn:syn@localhost/syn', { max: 1 });
    const matches = await sql`select external_ref from resolve_product_name(${f.brand_name.value}, ${f.product_name.value!})`;
    expect(matches.map((m) => m.external_ref)).toEqual(['IQB-0002']);
    const [{ ref }] = await sql`select product_reference(${matches[0].external_ref}) as ref`;
    await sql.end();

    // The user confirms the values exactly as read (no corrections).
    const confirmed = {
      product_name: { value: f.product_name.value! }, batch: { value: f.batch.value! },
      manufacture_date: { value: f.manufacture_date.value!.iso }, expiry_date: { value: f.expiry_date.value!.iso },
    };
    const build = buildScan({ label: { extraction, confirmed }, reference: ref as Reference, identifiedBy: 'label_name', today: new Date().toISOString().slice(0, 10) });
    const v = evaluate(build.input);
    console.log(v.verdict, v.step);
    expect(v.verdict).toBe('mismatch');
  }, 180_000);
});
