# THE SYSTEM

A personal, Solo Leveling-themed life-gamification PWA: gym, diet and life objectives as
quests, XP, levels and stats.

1. [Run it locally (Windows)](#1-run-it-locally-windows)
2. [Scripts](#2-scripts)
3. [Verifying](#3-verifying)
4. [Going live](#4-going-live) — hosted Supabase, the read-only check, Vercel
5. [Install on your phone](#5-install-on-your-phone)
6. [10-minute manual test](#6-10-minute-manual-test-hosted-on-your-phone)
7. [Conventions](#7-conventions)
8. [Project layout](#8-project-layout)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Run it locally (Windows)

**Requirements**

- Node **>= 22.22** — React Router 8 and Vitest 5 both need it. Check with `node -v`.
- Docker Desktop with WSL 2, for the local Supabase stack.
- No global CLIs. Everything runs through `npm run …` or `npx`.

**One-time setup.** If Docker Desktop reports _WSL not installed_, run this in an
**Administrator** PowerShell, then reboot:

```powershell
wsl --install --no-distribution
```

**First run.** In the project folder:

```powershell
npm install
```

```powershell
npx supabase start
```

The first `start` downloads several GB of images and applies all migrations to a local
Postgres. Then create your local environment file and fill it from the running stack:

```powershell
Copy-Item .env.example .env.local
```

```powershell
npx supabase status -o env
```

Put `API_URL` into `VITE_SUPABASE_URL` and `ANON_KEY` into `VITE_SUPABASE_ANON_KEY`. These
local values are the same public demo keys on every machine; `.env.local` is gitignored.

```powershell
npm run dev
```

Open http://localhost:5173 and sign up — the local stack does not send confirmation emails.

**Every day after that:** start Docker Desktop, then `npx supabase start` and
`npm run dev`. Stop the stack with `npx supabase stop`.

### 1.1 Test the dev build on your phone (home WiFi)

The phone opens the dev server by your PC's address on the home network. It only ever
talks to the dev server: in development, a page opened from another device sends its
Supabase calls to the dev server's own `/supabase` path, which forwards them to the local
stack (`vite.config.ts`, `src/lib/supabaseUrl.ts`). Nothing about your network is written to
any file, and production builds are unaffected.

1. The PC and the phone must be on the same WiFi/router. With the stack running
   (`npx supabase start`), start the dev server for the network:

   ```powershell
   npm run dev:lan
   ```

   Vite prints a `Network:` line per network adapter. Use the one marked `Ethernet` or
   `Wi-Fi` (an address like `http://192.168.x.y:5173`), not the `vEthernet`/WSL ones.

2. **Windows Firewall.** The first time Node.js listens on the network, Windows may show
   _"Windows Defender Firewall has blocked some features of Node.js JavaScript Runtime"_.
   Tick **Private networks**, click **Allow access**. If no prompt appears, Node is already
   allowed (check _Windows Security → Firewall & network protection → Allow an app through
   firewall → Node.js JavaScript Runtime_).

3. **Network profile.** If your home connection is marked _Public_, Windows blocks incoming
   connections for any app not explicitly allowed on Public. Set your home network to
   **Private**: _Settings → Network & internet → Ethernet_ (or _Wi-Fi → your network_) →
   _Network profile type_ → **Private network**. Only do this for your own home network.

4. On the phone, open the `Network:` address in the browser and sign in with your local
   account. The phone uses plain `http`, so it is a browser tab, not an installable PWA, and
   the Vibration API may be unavailable; everything else works as on the PC.

5. When you are done, stop the dev server (`Ctrl+C`) and the stack (`npx supabase stop`).
   While `supabase start` runs, Docker also publishes the local database and Studio ports on
   your network (default local passwords), so do not leave it running on networks you do not
   trust.

**Local walkthrough data.** `npx supabase db reset` wipes local accounts. After one, sign up
again, then:

```powershell
npm run sim:days -- --set 'sim.lived={4,3,2,1}' --set 'sim.food_only={}'
```

```powershell
npm run db:sql -- supabase/dev/seed_gym_history.sql
```

The first gives you four cleared days (no penalty waiting); the second adds Phase 1-style
gym history, including a custom "Squat" to try **Merge into…** on.

## 2. Scripts

| Script                | What it does                                                  |
| --------------------- | ------------------------------------------------------------- |
| `npm run dev`         | Vite dev server on http://localhost:5173                      |
| `npm run dev:lan`     | The same, reachable from your phone on home WiFi (see 1.1)    |
| `npm run build`       | Type-check both TS projects, then build to `dist/`            |
| `npm run preview`     | Serve the built app with its service worker on port 4173      |
| `npm run typecheck`   | `tsc` over `src/` and over the build config files             |
| `npm run lint`        | ESLint, type-aware on `src/`                                  |
| `npm run format`      | Prettier write (`format:check` to verify only)                |
| `npm test`            | Vitest: engine, parity, schemas, Vercel config                |
| `npm run gen:sql`     | Regenerate the SQL generated from `src/game/*.json`           |
| `npm run db:verify`   | Run all four SQL test scripts against the **local** stack     |
| `npm run db:sql -- f` | Run one SQL file against the local stack                      |
| `npm run sim:days`    | Dev only: wind your local hunter back to create days to close |
| `npm run icons`       | Regenerate PWA icons from `public/logo.svg`                   |

The `db:*` and `sim:*` scripts pipe SQL into the local stack's own database container. They
have no connection URL, so they cannot reach the hosted project.

## 3. Verifying

```powershell
npm run typecheck; npm run lint; npm test; npm run format:check; npm run build
```

```powershell
npm run db:verify
```

`db:verify` runs the date and scheduling parity suites, the RLS proof (hunter A cannot read or
write hunter B) and the end-to-end game-rules smoke test. Each runs in a transaction and rolls
back. Details are in [supabase/README.md](supabase/README.md).

To see the day close and System Report without waiting for midnight:

```powershell
npm run sim:days
```

then reload the app. The simulator refuses to run anywhere but the local stack.

## 4. Going live

You run every step in this section. Nothing in this repository touches the hosted project:
the scripts above only reach the local stack, and the deploy is yours.

### 4.1 Hosted Supabase

1. **Create the project.** At [supabase.com/dashboard](https://supabase.com/dashboard) choose
   _New project_. Pick the region nearest you (Frankfurt for Berlin). Save the **database
   password** in your password manager — step 7 asks for it.
2. **Turn email confirmation off.** _Authentication → Sign In / Providers → Email_: leave
   Email enabled and switch **Confirm email** off. With it on, sign-up cannot sign you
   straight in and onboarding stalls.
3. **Set the URLs.** _Authentication → URL Configuration_:
   - **Site URL**: your Vercel domain, e.g. `https://the-system.vercel.app`. Until you have
     it, use `http://localhost:5173` and come back after the first deploy.
   - **Redirect URLs**: add `https://the-system.vercel.app/**`, and keep
     `http://localhost:5173/**` for local work.

   Phase 1 signs in with a password and sends no emails, so these mostly matter for later
   features — but they must be right before any are added.

4. **Note the project ref** — the subdomain in the project URL
   (`https://<project-ref>.supabase.co`), also under _Settings → General_.
5. **Log the CLI in** (opens your browser):

   ```powershell
   npx supabase login
   ```

6. **Link this folder to the project:**

   ```powershell
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

7. **Preview the push** — it must list exactly the nine migrations in
   `supabase/migrations/`, `…000100_init_schema` to `…000900_quest_schedule_predicate`:

   ```powershell
   npx supabase db push --remote --dry-run
   ```

   > **`--remote` is required.** In the current Supabase CLI, `db push` targets the
   > **local** database by default. Without `--remote` it would push to your local stack,
   > change nothing on the hosted project, and the check in 4.2 would find no tables.

8. **Push:**

   ```powershell
   npx supabase db push --remote
   ```

   It asks you to confirm the change to the hosted project, and may ask for the database
   password from step 1.

9. **Run the read-only check** (4.2). Do not use the app until it passes.
10. **Copy the keys for Vercel.** _Settings → API Keys_: the Project URL, and the
    **publishable** key (or the legacy **anon** key). **Never** the secret or `service_role`
    key — it must not appear in Vercel, in this repo or in the browser.

### 4.2 Hosted read-only check

Open _SQL Editor_ in the dashboard, paste all of
[supabase/tests/hosted_readonly_check.sql](supabase/tests/hosted_readonly_check.sql) and press
**Run**. It is one `SELECT` — it cannot write, create users or change settings.

You should get 12 rows, every one `PASS`, ending with `ALL CHECKS | PASS | 11 of 11 passing`.
It checks that all tables exist with RLS on, that `xp_events` has no write policies or grants,
that `authenticated` can execute exactly the 14 RPCs plus the trigger function, that `anon`
can execute none, that table grants and policies match the design, and that the config and
the latest migration are in place. A `FAIL` row's detail column names exactly what is wrong.

Test users, the RLS proof and the smoke test stay local (`npm run db:verify`); they create
throwaway users and do not belong on the real project.

### 4.3 Vercel

**Deploy** one of two ways:

- **From Git** — push this repo to your own GitHub repository, then _Add New → Project_ in
  Vercel and import it.
- **From this folder, no GitHub** — `npx vercel` once to link (it asks you to log in), then
  `npx vercel --prod` for each production deploy. `.vercelignore` keeps your local
  `.env.local` from being uploaded.

**Environment variables** — _Settings → Environment Variables_, for Production (and Preview
if you use preview deploys):

| Name                     | Value                                         |
| ------------------------ | --------------------------------------------- |
| `VITE_SUPABASE_URL`      | `https://<project-ref>.supabase.co`           |
| `VITE_SUPABASE_ANON_KEY` | the publishable (or legacy anon) key from 4.1 |

**Build settings** come from `vercel.json`: framework Vite, build `npm run build`, output
`dist`, SPA rewrite and cache headers. Under _Settings → Build and Deployment_ set the
**Node.js version to 24.x** to match local; 22.x also works.

**The build refuses to ship a local bundle.** If the variables are missing or point at
`localhost` / `127.0.0.1`, the Vercel build stops with _Refusing a Vercel production build…_.
Set the variables and redeploy.

After the first deploy, put the Vercel domain into Supabase step 3.

### 4.4 Check the deployed URL

In desktop Chrome:

1. **SPA rewrite.** Open `https://<your-app>.vercel.app/quests/new` directly in a private
   window. You should land on _Hunter Access_, not a Vercel 404. Sign in, open _Log_, refresh:
   still the app.
2. **Service worker.** DevTools → _Application → Service workers_: `sw.js` _activated and is
   running_. _Cache storage_ → `workbox-precache-v2-…` holds 24 entries.
3. **Headers.** DevTools → _Network_, reload. `sw.js` has
   `Cache-Control: public, max-age=0, must-revalidate`; any `/assets/*.js` has
   `public, max-age=31536000, immutable`.
4. **Offline shell.** _Network_ → set _Offline_ → reload `/quests`. The shell renders and
   data shows _The System is unreachable_. Back online, the data returns.
5. **Installable.** _Application → Manifest_ lists no installability errors, and the address
   bar shows an install icon. (Lighthouse no longer has a PWA category; this panel is the
   equivalent check.)

## 5. Install on your phone

- **Android (Chrome):** open your Vercel URL → ⋮ menu → **Install app**.
- **iPhone (Safari):** open your Vercel URL in **Safari** → Share → **Add to Home Screen** →
  Add.

Open it from the home-screen icon. It runs full-screen with no browser bar. Sign in inside the
installed app — on iOS it keeps its own storage, separate from Safari. New deploys install
themselves; if the app looks stale, close it fully and reopen once.

## 6. 10-minute manual test (hosted, on your phone)

Use a fresh account. Tick each line; the expected result follows the arrow.

**0:00 – Install and sign up**

- [ ] Open the installed app → full-screen, dark, _THE SYSTEM_ header, _Hunter Access_.
- [ ] Sign up → straight to _Hunter Registration_, no email step.
- [ ] Register with the defaults and your timezone → **Status**: Level 1, Rank E, all five
      stats 10, _No points to allocate_, `0 / 60 XP`.
- [ ] **Quests** → four core quests: Train, Calories in range, Hit protein, Study.

**0:03 – Quests**

- [ ] Study: enter `30` → Complete → toast `+35 XP · INT +17`. Status shows `35 / 60 XP`,
      INT `17 / 30`.
- [ ] Undo it → Status back to `0 / 60`. Complete it again.

**0:04 – Logging and auto quests**

- [ ] Log → Food: `900` kcal, `70` g protein → no quest toast; Calories reads _Below range_.
- [ ] Add `900` kcal, `60` g → toast `+20 XP · STR +5 · VIT +5` (Hit protein).
- [ ] Quests → Calories in range shows `1800 kcal · In range - locks at day end` and is
      **not** complete — it is judged at day close. Do not log more food today.
- [ ] Log → Workout: a title and one set → toast `+35 XP · STR +9 · VIT +8` (Train), and
      the **LEVEL UP** modal: `1 → 2`, `+3 free points`.
- [ ] Delete the workout → `[Quest withdrawn]`. Levels come from the ledger, so you drop
      back to level 1. Log it again → the modal returns. Expected.

**0:07 – Status and settings**

- [ ] Status: Level 2, `Free points: 3`. Tap **+** on a stat → confirm → the stat shows
      `+1`, free points 2, and its XP bar does not move (allocated points never change the
      growth cost).
- [ ] Settings: change the protein target and save → _In force today_ still shows the old
      target, with _waiting for the next game day_.

**0:09 – Offline**

- [ ] Airplane mode on → close and reopen the app → the shell loads and shows _The System
      is unreachable_. Airplane mode off → the data returns.

**Next day, after 03:00 your time — the Phase 1 definition of done**

- [ ] Open the app → the **System Report** appears: yesterday `CLEARED`, `Core 4/4`,
      `+1 free point` (the calorie quest settles at the close and pays +35).
- [ ] Acknowledge → Status shows the extra free point → allocate it.

The day close only runs on a real new day on the hosted project: the dev simulator refuses to
run anywhere but your local stack, by design.

## 7. Conventions

### Mutations re-sync on settle, not on success

Every mutation invalidates its affected queries in **`onSettled`**, so the refresh happens
whether the call succeeded or failed:

```ts
onSettled: async () => {
  await invalidate(day);
},
```

The reason is a failure mode we hit for real in step 1.6: `delete_workout` committed in the
database — the workout was gone and the quest reversed — but the client could not parse the
reply, so it took the error path. With the invalidation in `onSuccess` the screen kept showing
a workout that no longer existed. A mutation that errors on the client tells you nothing about
whether the server committed, so the screen must always re-read the database.

Per-call UI reactions (toasts, redirects, cache priming) stay in the `onSuccess` / `onError`
callbacks at the call site. Only the re-sync belongs in `onSettled`.

### Everything the System says lives in `src/copy/system.ts`

Screen text, validation messages and the mapping from RPC error tokens to messages. The hunter
never sees a raw exception: query failures render a System error window, and a render crash is
caught by an error boundary — per screen, so the navigation survives, and at the root as a last
resort.

### Game numbers live in `src/game/game-config.json`

The engine reads it, and `npm run gen:sql` generates the SQL seed from it. A test fails if the
two drift.

## 8. Project layout

```
src/
  components/   SystemWindow, shell, guards, error boundary, shared controls
  copy/         every string the System says
  features/     auth, onboarding, status, quests, log, report, settings
  game/         pure game engine + shared JSON config and parity vectors
  lib/          Supabase client, zod schemas, error mapping, queries/, mutations/
  styles/       app.css - Tailwind v4 @theme design tokens
scripts/        gen-sql-artifacts.mjs, local-sql.mjs (local stack only)
supabase/
  migrations/   applied in filename order
  tests/        parity suites, RLS proof, smoke test, hosted read-only check
  dev/          simulate_days.sql (local only, refuses the hosted project)
```

## 9. Troubleshooting

| Symptom                                                | Fix                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| Docker Desktop: _WSL not installed_                    | `wsl --install --no-distribution` in an Administrator PowerShell, reboot |
| `docker` not found right after installing Docker       | Open a new terminal; old ones keep the old PATH                          |
| `npx supabase start` fails on ports 54321 / 54322      | Another stack is running: `npx supabase stop`, then start again          |
| Hosted sign-up says _Confirm your email address first_ | Confirm email is still on: section 4.1, step 2                           |
| Vercel build: _Refusing a Vercel production build_     | Set both environment variables (4.3) and redeploy                        |
| Installed app shows an old version after a deploy      | Close the app completely and reopen it once                              |
| `npm run db:verify` / `sim:days`: _no local stack_     | `npx supabase start` first                                               |
