import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
});
