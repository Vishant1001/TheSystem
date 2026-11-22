/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Safe for the browser. */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase anon (public) key. Safe for the browser; RLS is the guard. */
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
