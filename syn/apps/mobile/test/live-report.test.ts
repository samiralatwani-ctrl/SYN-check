// LIVE (opt-in): SYN_LIVE=1 npx vitest run test/live-report.test.ts
// Saves one TEST_ report through the app's Supabase repo as an anonymous user. Delete it afterwards.
import { describe, expect, it } from 'vitest';
import method from '../../../packages/rules-engine/src/method-v1.json';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../src/config';
import { createSupabaseRepo } from '../src/data/supabaseRepo';

describe.skipIf(!process.env.SYN_LIVE)('LIVE report save', () => {
  it('contacts load and a report is stored with its scan and signals', async () => {
    const repo = createSupabaseRepo(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const c = await repo.reportContacts('IQB-0002');
    expect(c.brand?.emails).toContain('ProductSurveillance_EAME@abbvie.com');
    const r = await repo.saveReport({
      scan: { verdict: 'mismatch', methodVersion: method.version, methodSha256: method.rules_sha256, variantId: null, productId: null,
        extraction: null, purchaseChannel: 'social_media',
        signals: [{ type: 'alert_batch', outcome: 'mismatch', severity: 'critical', weight: 6, confidence: 1, evidence: { found: 'TEST_' } }] },
      report: { recipients: ['test@example.test'], channel: 'email', messageText: 'TEST_ live check — delete me', attachmentsCount: 0,
        sellerInfoPrivate: 'TEST_SELLER', purchaseChannel: 'social_media' },
    });
    expect(r.reportId).toMatch(/^[0-9a-f-]{36}$/);
  }, 60_000);
});
