import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * A production build on Vercel must point at the hosted Supabase project.
 * .env.local points at the local stack, and if the Vercel environment
 * variables were ever missing the build would quietly ship a bundle wired to
 * 127.0.0.1 - which installs fine and then fails on every phone. Refuse it
 * instead. Local production builds (npm run build, npm run preview) are
 * unaffected: VERCEL is only set on Vercel's builders.
 */
function assertHostedSupabaseOnVercel(mode: string): void {
  if (process.env.VERCEL !== '1' || mode !== 'production') return;

  // Real environment variables win over .env files, exactly as in Vite itself.
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const url = env.VITE_SUPABASE_URL ?? '';
  const key = env.VITE_SUPABASE_ANON_KEY ?? '';

  const local = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'];
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }

  if (host === '' || local.includes(host) || key === '') {
    throw new Error(
      'Refusing a Vercel production build: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be ' +
        'set in the Vercel project (Settings > Environment Variables) and point at the hosted ' +
        `Supabase project. Got URL "${url || '(empty)'}".`,
    );
  }
}

export default defineConfig(({ mode }) => {
  assertHostedSupabaseOnVercel(mode);

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        pwaAssets: { config: true },
        manifest: {
          id: '/',
          name: 'THE SYSTEM',
          short_name: 'SYSTEM',
          description: 'Hunter status, quests and daily logs.',
          lang: 'en',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#05070D',
          theme_color: '#05070D',
          categories: ['health', 'fitness', 'productivity'],
        },
        workbox: {
          // The plugin precaches manifest.webmanifest itself; listing it here too
          // produces conflicting precache entries and kills the whole precache.
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
          inlineWorkboxRuntime: true,
          clientsClaim: true,
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
