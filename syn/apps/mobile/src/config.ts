// Public project values (safe to ship: the publishable key only reaches RLS-protected tables and read-only RPCs).
// Override with EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY; EXPO_PUBLIC_SYN_FIXTURES=1 forces demo data.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://lommcwfzmbfbeyafymzf.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_QRa2AmSm31_qCd3p2DiEoQ_fmzfXPTW';
export const USE_FIXTURES = process.env.EXPO_PUBLIC_SYN_FIXTURES === '1';

// Public policy pages (served from the repository via GitHub Pages once enabled; see docs/store/CHECKLIST.md).
export const POLICY_BASE = 'https://samiralatwani-ctrl.github.io/lamber-lab/syn/docs/site';
export const PRIVACY_URL = `${POLICY_BASE}/privacy.html`;
export const CORRECTIONS_URL = `${POLICY_BASE}/corrections.html`;
// Owner decision pending (docs/store/CHECKLIST.md): public support address. Empty = contact link hidden.
export const SUPPORT_EMAIL = '';
