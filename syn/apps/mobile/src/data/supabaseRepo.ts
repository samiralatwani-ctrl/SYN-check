import { createClient } from '@supabase/supabase-js';
import type { ExtractionResult } from '@syn/label-extraction';
import type { ExploreData, LookupResult, NameMatch, Reference, ReferenceRepo, ReportContacts, SaveReportInput, SearchHit } from './types';

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
    reportContacts: (ref) => rpc<ReportContacts>('report_contacts', { p_external_ref: ref ?? '' }),
    explore: () => rpc<ExploreData>('explore', {}),
    async deleteMyData() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;                     // nothing was ever stored for this device
      const res = await rpc<{ reports: number; scans: number; usage_log: number }>('delete_my_data', {});
      await sb.auth.signOut();
      return res;
    },
    async saveReport({ scan, report }: SaveReportInput) {
      await ensureSession();
      const { data: u } = await sb.auth.getUser();
      const user_id = u.user!.id;
      const { data: s, error: e1 } = await sb.from('scans').insert({
        user_id, verdict: scan.verdict, method_version: scan.methodVersion, method_sha256: scan.methodSha256,
        variant_id: scan.variantId, product_id: scan.productId, extraction: scan.extraction, purchase_channel: scan.purchaseChannel,
      }).select('id').single();
      if (e1) throw e1;
      if (scan.signals.length) {
        const { error: e2 } = await sb.from('scan_signals').insert(scan.signals.map((g) => ({ scan_id: s.id, ...g })));
        if (e2) throw e2;
      }
      const { data: r, error: e3 } = await sb.from('reports').insert({
        scan_id: s.id, user_id, recipients: report.recipients, channel: report.channel, message_text: report.messageText,
        attachments_count: report.attachmentsCount, seller_info_private: report.sellerInfoPrivate, purchase_channel: report.purchaseChannel,
      }).select('id').single();
      if (e3) throw e3;
      return { scanId: s.id, reportId: r.id };
    },
    async extractLabel(imageBase64, mediaType) {
      await ensureSession();
      const { data, error } = await sb.functions.invoke<ExtractionResult>('extract-label', { body: { image_base64: imageBase64, media_type: mediaType } });
      if (error) throw error;
      return data!;
    },
  };
}
