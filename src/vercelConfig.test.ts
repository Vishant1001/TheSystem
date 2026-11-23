import { describe, expect, it } from 'vitest';
import raw from '../vercel.json?raw';

/**
 * vercel.json shipped as invalid JSON from step 1.1 to step 1.8: the rewrite
 * regex was written with a bare backslash escape (a backslash before a dot),
 * which is not a legal JSON escape. Prettier's lenient JSON parser accepted
 * it, nothing parsed it strictly, and Vercel - which does - would have
 * rejected the file or run without the SPA rewrite on the first deploy.
 *
 * These tests parse it the strict way and pin down what the rewrite must and
 * must not touch.
 */
interface VercelConfig {
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

function parseStrict(): VercelConfig {
  return JSON.parse(raw) as VercelConfig;
}

/**
 * Vercel matches `source` with path-to-regexp. This rule is a single group
 * holding a raw regex, so it behaves as that regex anchored at both ends.
 */
function rewritten(path: string): boolean {
  const rule = parseStrict().rewrites[0];
  if (rule === undefined) throw new Error('no rewrite rule');
  return new RegExp(`^${rule.source}$`).test(path);
}

describe('vercel.json', () => {
  it('is valid JSON under a strict parser', () => {
    expect(() => parseStrict()).not.toThrow();
  });

  it('sends every client route to index.html, including deep links', () => {
    const routes = [
      '/',
      '/auth',
      '/onboarding',
      '/quests',
      '/quests/new',
      '/quests/6bf38079-6d04-46b1-9b69-f6882dd8b7c7/edit',
      '/log',
      '/report',
      '/settings',
      '/a/route/that/does/not/exist',
    ];
    for (const route of routes) {
      expect(rewritten(route), route).toBe(true);
    }
    expect(parseStrict().rewrites[0]?.destination).toBe('/index.html');
  });

  it('never rewrites a real file, so assets and the service worker are served as themselves', () => {
    const files = [
      '/assets/index-DTrkTDRf.js',
      '/assets/index-CmURHrHX.css',
      '/assets/inter-latin-400-normal-C38fXH4l.woff2',
      '/sw.js',
      '/registerSW.js',
      '/manifest.webmanifest',
      '/favicon.ico',
      '/pwa-192x192.png',
      '/maskable-icon-512x512.png',
      '/apple-touch-icon-180x180.png',
      '/logo.svg',
    ];
    for (const file of files) {
      expect(rewritten(file), file).toBe(false);
    }
  });

  it('never caches the service worker, so updates reach installed phones', () => {
    const sw = parseStrict().headers.find((entry) => entry.source === '/sw.js');
    expect(sw?.headers).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=0, must-revalidate',
    });
  });

  it('caches hashed assets forever, since their names change with their content', () => {
    const assets = parseStrict().headers.find((entry) => entry.source === '/assets/(.*)');
    expect(assets?.headers).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',
    });
  });
});
