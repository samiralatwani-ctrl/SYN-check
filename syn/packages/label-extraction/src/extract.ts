import Anthropic from '@anthropic-ai/sdk';
import schema from '../../schemas/label-extraction.schema.json' with { type: 'json' };
import { PROMPT_VERSION, SYSTEM_PROMPT, USER_INSTRUCTION } from './prompt';
import type { ExtractionResult } from './types';
import { fromWire, type WireExtraction } from './wire';
import { enforceInvariants } from './validate';

export const MODEL = 'claude-opus-5-5';
export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export class ExtractionError extends Error {
  constructor(public code: 'refusal' | 'truncated' | 'no_output' | 'invalid_json' | 'image_too_large', message: string) { super(message); }
}

/**
 * One label photo -> validated extraction. Runs on the server only (the API key never reaches the app).
 * The photo is sent to the API and not stored by us (D-009).
 */
export async function extractLabel(client: Anthropic, imageBase64: string, mediaType: ImageMediaType): Promise<ExtractionResult> {
  if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) throw new ExtractionError('image_too_large', 'image over 5 MB');

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // Server-side fallback on a policy decline (routes by refusal category).
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: USER_INSTRUCTION },
      ],
    }],
  });

  if (response.stop_reason === 'refusal') throw new ExtractionError('refusal', response.stop_details?.explanation ?? 'declined');
  if (response.stop_reason === 'max_tokens') throw new ExtractionError('truncated', 'output truncated');
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  if (!text) throw new ExtractionError('no_output', 'no text output');
  let wire: WireExtraction;
  try { wire = JSON.parse(text) as WireExtraction; } catch { throw new ExtractionError('invalid_json', 'output is not JSON'); }

  const { extraction, corrections } = enforceInvariants(fromWire(wire));
  return {
    extraction, corrections,
    meta: { engine: 'server_vision', model: MODEL, served_by: response.model, prompt_version: PROMPT_VERSION, extracted_at: new Date().toISOString() },
  };
}
