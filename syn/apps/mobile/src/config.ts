// Public project values (safe to ship: the publishable key only reaches RLS-protected tables and read-only RPCs).
// Override with EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY; EXPO_PUBLIC_SYN_FIXTURES=1 forces demo data.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://lommcwfzmbfbeyafymzf.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_QRa2AmSm31_qCd3p2DiEoQ_fmzfXPTW';
export const USE_FIXTURES = process.env.EXPO_PUBLIC_SYN_FIXTURES === '1';
