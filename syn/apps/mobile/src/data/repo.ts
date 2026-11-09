import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, USE_FIXTURES } from '../config';
import { fixtureRepo } from './fixtureRepo';
import { createSupabaseRepo } from './supabaseRepo';
import type { ReferenceRepo } from './types';

export const repo: ReferenceRepo = USE_FIXTURES ? fixtureRepo : createSupabaseRepo(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
