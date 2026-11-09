// POST /functions/v1/extract-label  { image_base64, media_type }  ->  { extraction, meta, corrections }
// Reads a label photo with Claude vision. The API key exists only here (ANTHROPIC_API_KEY secret).
// The photo is not stored. Each call is billed, so callers must be signed in (anonymous sign-in is fine)
// and are limited per day.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { ExtractionError, extractLabel, type ImageMediaType } from '../_shared/label-extraction/server.ts';

const MEDIA: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/webp'];
const DAILY_LIMIT = Number(Deno.env.get('SYN_LABEL_DAILY_LIMIT') ?? '30');
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const anthropic = new Anthropic();   // reads ANTHROPIC_API_KEY from the function's secrets
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const { data: auth } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
  const user = auth?.user;
  if (!user) return json(401, { error: 'sign_in_required' });

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from('label_extraction_log').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) return json(429, { error: 'daily_limit' });

  let body: { image_base64?: unknown; media_type?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }
  const image = typeof body.image_base64 === 'string' ? body.image_base64.replace(/^data:[^,]+,/, '') : '';
  const media = MEDIA.find((m) => m === body.media_type);
  if (!image || !media) return json(400, { error: 'image_base64_and_media_type_required' });

  const log = (ok: boolean, error_code: string | null) => admin.from('label_extraction_log').insert({ user_id: user.id, ok, error_code });
  try {
    const result = await extractLabel(anthropic, image, media);
    await log(true, null);
    return json(200, result);
  } catch (e) {
    if (e instanceof ExtractionError) { await log(false, e.code); return json(e.code === 'image_too_large' ? 413 : 422, { error: e.code }); }
    if (e instanceof Anthropic.RateLimitError) { await log(false, 'rate_limited'); return json(503, { error: 'busy_try_again' }); }
    if (e instanceof Anthropic.APIError) { await log(false, `api_${e.status}`); return json(502, { error: 'vision_unavailable' }); }
    throw e;
  }
});
