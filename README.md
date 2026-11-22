# THE SYSTEM

A personal, Solo Leveling-themed life-gamification PWA: gym, diet and life objectives as
quests, XP, levels and stats.

Phase 1 is being built step by step (1.1 - 1.8). This README covers setup; the full manual
test checklist arrives in step 1.8.

## Requirements

- Node **>= 22.22** (React Router 8 and Vitest 5 both require it) - `node -v`
- No global CLIs. Everything runs through `npm run ...` or `npx`.

## Setup

```powershell
npm install
```

```powershell
Copy-Item .env.example .env.local
```

Then fill `.env.local` with your Supabase project URL and anon key. Only those two values may
ever reach the frontend - the `service_role` key must never appear in this project. `.env.local`
is gitignored; `.env.example` is the committed template.

## Scripts

| Script              | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Vite dev server on http://localhost:5173                 |
| `npm run build`     | Type-check both TS projects, then build to `dist/`       |
| `npm run preview`   | Serve the built app (service worker active) on port 4173 |
| `npm run typecheck` | `tsc` over `src/` and over the build config files        |
| `npm run lint`      | ESLint (type-aware on `src/`)                            |
| `npm run format`    | Prettier write                                           |
| `npm test`          | Vitest (engine tests land in step 1.2)                   |
| `npm run icons`     | Regenerate PWA icons from `public/logo.svg`              |

## PWA

Icons are generated from `public/logo.svg` by `@vite-pwa/assets-generator` (`npm run icons`)
and committed to `public/`. The service worker precaches the app shell (HTML, JS, CSS, fonts,
icons) and falls back to `index.html` for client-side routes, so the installed app opens
offline. There is no offline **data** sync - Supabase calls still need a connection.

The service worker only runs in a production build: use `npm run preview`, not `npm run dev`.

## Deployment

Vercel-ready: `vercel.json` sets the build command, SPA rewrites and cache headers.

## Project layout

```
src/
  components/  SystemWindow, AppShell, BottomNav, shared controls
  copy/        every string the System says
  features/    auth, onboarding, status, quests, log, report
  game/        pure game engine (step 1.2)
  lib/         supabase client, queries, mutations
  styles/      app.css - Tailwind v4 @theme design tokens
supabase/      migrations (step 1.3)
```
