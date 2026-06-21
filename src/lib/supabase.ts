import { createClient } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | undefined;

export function getSupabaseBrowserClient() {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) {
      throw new Error('Supabase browser environment variables are not configured.');
    }
    client = createClient(url, publishableKey, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}
