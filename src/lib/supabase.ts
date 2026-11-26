import {createClient, type SupabaseClient} from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';
let cachedKey = '';

export function getSupabaseClient(url?: string | null, publishableKey?: string | null): SupabaseClient | null {
  const resolvedUrl = (url || import.meta.env.VITE_SUPABASE_URL || '').trim();
  const resolvedKey = (publishableKey || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

  if (!resolvedUrl || !resolvedKey) {
    return null;
  }

  if (cachedClient && cachedUrl === resolvedUrl && cachedKey === resolvedKey) {
    return cachedClient;
  }

  cachedUrl = resolvedUrl;
  cachedKey = resolvedKey;
  cachedClient = createClient(resolvedUrl, resolvedKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cachedClient;
}
