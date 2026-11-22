import { defineConfig } from '@vite-pwa/assets-generator/config';

/**
 * Icons are generated from public/logo.svg.
 * Maskable and Apple icons get the abyss background so they never render on white.
 * Regenerate with: npm run icons
 */
export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']],
    },
    maskable: {
      sizes: [512],
      padding: 0.3,
      resizeOptions: { background: '#05070D', fit: 'contain' },
    },
    apple: {
      sizes: [180],
      padding: 0.3,
      resizeOptions: { background: '#05070D', fit: 'contain' },
    },
  },
  images: ['public/logo.svg'],
});
