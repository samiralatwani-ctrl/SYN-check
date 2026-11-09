import { createClient } from '@supabase/supabase-js';
import type { ExtractionResult } from '@syn/label-extraction';
import type { LookupResult, NameMatch, Reference, ReferenceRepo, SearchHit } from './types';

export function createSupabaseRepo(url: string, anonKey: string): ReferenceRepo {
  const sb = createClient(url, anonKey, { auth: { persistSession: false } });
  const rpc = async <T>(fn: string, args: Record<string, unknown>) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw error;
    return data as T;
  };
  /** Label reading is billed per call, so the function requires a session; anonymous sign-in is enough. */
  const ensureSession = async () => {
    const { data } = await sb.auth.getSession();
    if (!data.session) { const { error } = await sb.auth.signInAnonymously(); if (error) throw error; }
  };
  return {
    demo: false,
    lookupGtin: (gtin14) => rpc<LookupResult>('lookup_gtin', { p_gtin14: gtin14 }),
    searchProducts: async (query) => (await rpc<SearchHit[]>('search_products', { p_query: query, p_limit: 20 })) ?? [],
    resolveProductName: async (brand, name) => (await rpc<NameMatch[]>('resolve_product_name', { p_brand: brand, p_name: name })) ?? [],
    productReference: (externalRef) => rpc<Reference>('product_reference', { p_external_ref: externalRef }),
    async extractLabel(imageBase64, mediaType) {
      await ensureSession();
      const { data, error } = await sb.functions.invoke<ExtractionResult>('extract-label', { body: { image_base64: imageBase64, media_type: mediaType } });
      if (error) throw error;
      return data!;
    },
  };
}
