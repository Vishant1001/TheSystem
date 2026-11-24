const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Must match SUPABASE_DEV_PROXY_PATH in vite.config.ts. */
export const DEV_PROXY_PATH = '/supabase';

/**
 * Dev only (phone testing over home WiFi, `npm run dev:lan`): a local
 * Supabase URL like http://127.0.0.1:54321 means "this PC". A phone that
 * opened the app at http://<PC's LAN IP>:5173 cannot use it, so the client
 * goes through the dev server's own `/supabase` proxy on the page's origin -
 * same origin, so no cross-origin or local-network request for the phone's
 * browser to block. Nothing about the network is stored anywhere, and a
 * production build never rewrites.
 */
export function resolveSupabaseUrl(url: string, pageOrigin: string | null, dev: boolean): string {
  if (!dev || pageOrigin === null) return url;
  const page = new URL(pageOrigin);
  if (LOOPBACK.has(page.hostname)) return url;
  if (!LOOPBACK.has(new URL(url).hostname)) return url;
  return `${page.origin}${DEV_PROXY_PATH}`;
}
