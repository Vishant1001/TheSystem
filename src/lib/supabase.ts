import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { resolveSupabaseUrl } from './supabaseUrl';

const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!configuredUrl || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.',
  );
}

// Dev over home WiFi: the phone reaches the local stack through the PC's host.
// The DEV branch is a compile-time constant: production builds keep only
// configuredUrl, and the proxy code is dropped from the bundle entirely.
const url = import.meta.env.DEV
  ? resolveSupabaseUrl(
      configuredUrl,
      typeof window === 'undefined' ? null : window.location.origin,
      true,
    )
  : configuredUrl;

/**
 * The only Supabase client in the app. Typed from the live schema via
 * `npx supabase gen types typescript` (brief 7.4).
 *
 * Only the anon key ever reaches the browser; RLS and the RPCs are the guard.
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
