import { createSupabaseRepo } from './supabaseRepo';
import { fixtureRepo } from './fixtureRepo';
import type { ReferenceRepo } from './types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const repo: ReferenceRepo =
  process.env.EXPO_PUBLIC_SYN_FIXTURES === '1' || !url || !key ? fixtureRepo : createSupabaseRepo(url, key);
