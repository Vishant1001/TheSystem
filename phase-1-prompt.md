# THE SYSTEM — Phase 1 Build Brief (for Claude Code)

You are acting as my senior full-stack engineer. I am the software architect and product owner. This document is the complete brief for **Phase 1** of a personal, Solo Leveling–themed life-gamification PWA that tracks gym, diet and life objectives as quests, XP, levels and stats.

Read the entire brief before doing anything. Then follow the **Working protocol** exactly.

---

## 0. Working protocol (read first)

1. **Do not write code yet.** First reply with: (a) your understanding of the scope in 5–10 bullets, (b) any contradictions or gaps you found in this brief, (c) questions you need answered. Wait for my answers.
2. Phase 1 is split into **Steps 1.1 – 1.8** (section 9). Do **one step at a time**. At the end of each step, stop and report:
   - What you built (short)
   - Files created / changed
   - How I verify it (exact commands + what I should see)
   - Anything you deviated from, and why
     Then wait for me to say **"continue"**.
3. If something in this brief is ambiguous, **ask** — do not guess on architecture, schema, or game rules.

## 1. Hard rules (non-negotiable)

- **Never** run `git push`, create remote repos, or touch GitHub. Local commits only, one per completed step, and only after I approve that step.
- **Never** install any CLI globally. Use `npx` for everything (I'm on Windows — `npx supabase …` is the only reliable path; global Supabase CLI install fails).
- **Never** run `npx supabase db push`, `db reset`, or anything that changes the **remote** database without asking me first. Write migrations as files; I'll approve applying them.
- **Never** put the Supabase `service_role` key anywhere in the frontend or in committed files. Frontend uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.local`. Provide `.env.example`. Ensure `.env*` (except `.env.example`) is gitignored.
- **Never** modify files outside the project folder.
- **Never** add dependencies beyond the stack in section 3 without asking.
- **Never** implement anything listed as Out of Scope (section 2). If you think something out of scope is needed, ask.
- **Never** hard-code game numbers (XP, caps, curves, ranks, points) outside the game config file. One source of truth.
- **Never** change a game formula from section 5. If you think one is wrong, tell me.
- No `TODO` stubs or placeholder UIs for in-scope items. If it's in scope, it works.
- TypeScript `strict: true`. No `any` unless justified in a comment.

## 2. Scope

### In scope (Phase 1)

- Email + password auth (Supabase Auth)
- Onboarding: hunter name, timezone, calorie range, protein target → seeds default daily quests
- Hunter **Status** screen: name, level, rank, XP bar, 5 stats, free points + allocation
- **Quests**: today's quest list, manual completion/undo, create/edit/archive custom quests
- **Auto-tracked quests** driven by logs (workout logged, protein ≥ target, calories within range)
- **Logging**: simple food entries (name, kcal, protein) and simple workouts (title + sets of exercise/reps/weight)
- **XP ledger** (append-only) with per-category daily caps
- Levels, ranks (level-derived only), stats starting at 10, stat XP, free points
- **Day close** + **System Report** screen (summary of yesterday on next app open)
- Level-up modal
- Installable PWA (manifest + icons + offline app shell). No offline data sync.

### Out of scope (later phases — do NOT build)

Penalty Zone, Survival Trials, XP Debt, Weakened debuff, Redemption Stones, rest days / sick mode, Gates, Rank-Up Trials, weekly quests, titles/achievements, Shadows, boss fights / PR detection, exercise library, barcode scanning / Open Food Facts, AI food logging, push notifications, sound effects, party / multi-user features, avatars, Capacitor/native wrapping.

**However:** the day-close function is the future hook for the Penalty Zone. Structure it so a penalty step can be inserted later without rewriting it (see 6.4).

## 3. Stack

| Layer        | Choice                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------- |
| Build        | Vite + React (latest stable) + TypeScript                                                      |
| Styling      | Tailwind CSS v4 (CSS-first `@theme` tokens)                                                    |
| Animation    | `motion` (formerly Framer Motion)                                                              |
| Routing      | React Router                                                                                   |
| Server state | TanStack Query                                                                                 |
| Validation   | zod (forms + RPC inputs on the client)                                                         |
| Backend      | Supabase: Postgres, Auth, RLS, SQL RPC functions                                               |
| PWA          | `vite-plugin-pwa`                                                                              |
| Tests        | Vitest                                                                                         |
| Hosting      | Vercel (I'll deploy; just make it Vercel-ready)                                                |
| Fonts        | Rajdhani (headings, numbers, System text), Inter (body) — self-host via `@fontsource` packages |

Verify the current stable versions and APIs before using them (especially Tailwind v4 and `motion`); don't rely on memory of older APIs.

## 4. Architecture decisions (ADR summary)

**ADR-1 — Append-only XP ledger.** All progression comes from `xp_events`. Level, rank, stat values and free points are **derived** from the ledger + allocations, never stored as mutable counters. Undo = insert a reversal event (negative amounts) referencing the original; never delete or update events. Reason: formulas will be tuned later and all history must recompute correctly.

**ADR-2 — Pure game engine.** `src/game/` is pure TypeScript: no React, no Supabase, no `Date.now()` inside functions (dates passed in). It contains `config.ts` (all numbers) and the derivation functions. 100% unit-tested.

**ADR-3 — Writes that touch the ledger go through Postgres RPC functions** (`SECURITY INVOKER`, so RLS still applies, `set search_path = public`). Each RPC is one transaction: e.g. completing a quest inserts the completion _and_ its XP event atomically, applying daily caps. The client never inserts into `xp_events` directly (enforce with RLS: no INSERT policy for `authenticated` on `xp_events`; RPCs that need to write it use `SECURITY DEFINER` with explicit `auth.uid()` checks — **flag this choice to me in Step 1.3 and justify it**).

**ADR-4 — Split of logic.** XP _awards_ and _caps_ are computed in SQL (simple lookups). _Curves_ (level from XP, stat value from stat XP, free points) are computed by the TS engine on read. The cap and reward numbers therefore exist in two places (SQL `game_config` table seeded by migration + `config.ts`). Add a Vitest test that parses the seed migration (or a shared `game-config.json` used by both) so they can't drift. Prefer the shared JSON approach if feasible — propose it.

**ADR-5 — Trust model.** Single-user-per-account personal app. Free-point allocation is validated client-side by the engine and RLS restricts rows to the owner; the DB does not re-derive levels. Documented trade-off: if a competitive/party feature is added later, allocation validation moves server-side.

**ADR-6 — Dates & timezones.** A "game day" is the calendar date in the hunter's `timezone` (default `Europe/Berlin`). All `occurred_on` columns are `date`, computed server-side from `now() at time zone hunters.timezone`. Never compute "today" from the browser's UTC.

**ADR-7 — Lazy day close.** No cron. On app load, the client calls `close_days()`, which idempotently closes every unclosed game day before today. Safe to call repeatedly.

## 5. Game rules (exact)

All of these live in `src/game/config.ts` (and the shared config per ADR-4).

### 5.1 Levels

```
xpToNext(n) = roundToNearest10(50 + 6 * n^1.7)      // XP needed to go from level n to n+1
```

- Hunters start at **level 1, 0 XP**.
- `levelFromTotalXp(total)` returns `{ level, xpIntoLevel, xpForNext }`.
- Sanity values (must be unit tests): `xpToNext(1) = 60`, `xpToNext(10) = 350`, `xpToNext(20) = 1030`, `xpToNext(30) = 2000`.
- Property test: for any k, `levelFromTotalXp(sum(xpToNext(1..k))).level === k + 1`.
- Total XP can't go below 0 for level purposes (clamp).

### 5.2 Ranks (Phase 1: level-derived only)

| Rank | Levels |
| ---- | ------ |
| E    | 1–9    |
| D    | 10–19  |
| C    | 20–29  |
| B    | 30–44  |
| A    | 45–59  |
| S    | 60+    |

### 5.3 Stats

- Five stats: `STR, AGI, VIT, INT, SENSE`. All start at **10**.
- Auto growth from stat XP: `statXpToNext(v) = 30 + 3 * (v - 10)`.
  `statFromStatXp(totalStatXp)` walks this curve from 10 and returns `{ autoValue, xpIntoPoint, xpForNext }`.
- **Displayed stat = autoValue + allocated points.** Allocated points do **not** change the auto-growth cost (cost is based on autoValue only). Unit-test this.

### 5.4 Free points

```
freePointsEarned   = 3 * (level - 1) + sum(xp_events.free_points)
freePointsAvailable = freePointsEarned - sum(stat_allocations.points)
```

- `+3` per level gained.
- `+1` per **daily clear** (all core quests for a day done), granted at day close as a `daily_clear` event with `free_points = 1`.
- Allocation is permanent (no respec in Phase 1). Confirm dialog before allocating.

### 5.5 Quest rewards

| Difficulty | XP  |
| ---------- | --- |
| E          | 10  |
| D          | 20  |
| C          | 35  |
| B          | 50  |
| A          | 75  |
| S          | 100 |

- Stat XP = `floor(XP / 2)`, split evenly across the quest's 1–2 stat tags (floor each, minimum 1 per tag).
- `xp_reward` is derived from difficulty at write time by the RPC (not trusted from the client).

### 5.6 Daily caps (per hunter, per game day, per category)

| Category | Cap (XP) |
| -------- | -------- |
| fitness  | 150      |
| diet     | 100      |
| life     | 150      |

- If an award would exceed the cap, award only the remaining XP; scale stat XP by the same ratio (floor). Mark `capped = true` on the event. If remaining is 0, still record the completion and a 0-XP event with `capped = true` (so the UI can say "Daily limit reached").
- Reversals give back cap room.
- `daily_clear` events are not subject to caps.

### 5.7 Default quests (seeded at onboarding; all editable)

| Title             | Category | Tracking                                          | Goal             | Stats    | Difficulty | Core |
| ----------------- | -------- | ------------------------------------------------- | ---------------- | -------- | ---------- | ---- |
| Train             | fitness  | `auto_workout` (any workout logged that day)      | boolean          | STR, VIT | C          | yes  |
| Calories in range | diet     | `auto_kcal_range` (uses hunter kcal_min/kcal_max) | numeric, kcal    | VIT      | C          | yes  |
| Hit protein       | diet     | `auto_protein_min` (≥ hunter protein_target_g)    | numeric, g       | VIT, STR | D          | yes  |
| Study             | life     | manual                                            | duration, 30 min | INT      | C          | yes  |

Onboarding defaults (editable placeholders): kcal 1700–1900, protein 120 g, timezone Europe/Berlin.

### 5.8 Auto-tracked quest evaluation

- `auto_workout`: completes immediately when a workout is logged for that day; reverses if the last workout of that day is deleted.
- `auto_protein_min`: completes immediately when the day's protein sum reaches target; reverses if a deletion drops it below.
- `auto_kcal_range`: **only evaluated at day close** (you can still overshoot later in the day). The UI shows live status: "Below range / In range — locks at day end / Over range".
- Auto quests cannot be manually completed.

## 6. Data model

Write as Supabase migrations in `supabase/migrations/`. Every table has `user_id uuid not null references auth.users on delete cascade` (except where it's the PK), RLS enabled, and owner-only policies. Add indexes on `(user_id, occurred_on)` where relevant. Use `check` constraints for enums (or Postgres enums — propose which).

### 6.1 Tables

**hunters** — `user_id (pk)`, `hunter_name`, `timezone`, `kcal_min`, `kcal_max`, `protein_target_g`, `created_on date`, `last_closed_on date null`, `created_at`.

**quests** — `id`, `user_id`, `title`, `type ('daily' | 'one_time')`, `category ('fitness' | 'diet' | 'life')`, `tracking ('manual' | 'auto_workout' | 'auto_kcal_range' | 'auto_protein_min')`, `goal_type ('boolean' | 'count' | 'duration' | 'numeric')`, `target_value numeric null`, `unit text null`, `stat_tags text[]` (1–2 items, valid stats only), `difficulty ('E'..'S')`, `is_core bool`, `schedule_days smallint[]` (ISO 1–7, daily quests only; default all 7), `due_on date null` (one_time only), `sort_order int`, `archived_at null`, `created_at`.

**quest_completions** — `id`, `user_id`, `quest_id`, `occurred_on date`, `value numeric null`, `completed_at`, `reversed_at null`. Partial unique index: one active completion per `(quest_id, occurred_on)` where `reversed_at is null`.

**food_entries** — `id`, `user_id`, `occurred_on`, `name`, `kcal int`, `protein_g numeric`, `created_at`.

**workouts** — `id`, `user_id`, `occurred_on`, `title`, `notes null`, `created_at`.
**workout_sets** — `id`, `user_id`, `workout_id (cascade)`, `exercise_name`, `set_index`, `reps int`, `weight_kg numeric null`.

**xp_events** (append-only) — `id`, `user_id`, `occurred_on`, `created_at`, `source_type ('quest' | 'daily_clear' | 'reversal')`, `source_id uuid null`, `category null`, `xp int`, `str_xp`, `agi_xp`, `vit_xp`, `int_xp`, `sense_xp int` (default 0), `free_points int default 0`, `capped bool default false`, `reverses_event_id uuid null`. No UPDATE/DELETE policies at all.

**stat_allocations** — `id`, `user_id`, `stat`, `points int > 0`, `created_at`.

**daily_logs** — `user_id`, `log_date`, `status ('cleared' | 'failed')`, `core_total`, `core_done`, `closed_at`; PK `(user_id, log_date)`.

**game_config** — per ADR-4.

### 6.2 RPC functions

- `game_today()` → hunter's current game date.
- `complete_quest(p_quest_id, p_value)` → manual quests only; validates goal (value ≥ target for count/duration/numeric), inserts completion + capped XP event. Returns the event.
- `undo_completion(p_completion_id)` → same day only; sets `reversed_at`, inserts reversal event.
- `log_food(p_name, p_kcal, p_protein_g)` / `delete_food(p_id)` → write entry, re-evaluate `auto_protein_min` for that day.
- `log_workout(p_title, p_notes, p_sets jsonb)` / `delete_workout(p_id)` → write workout + sets, re-evaluate `auto_workout`.
- `allocate_points(p_stat, p_points)` → inserts allocation (client validates availability per ADR-5).
- `close_days()` → see 6.4.

### 6.3 Read model

Provide a view or RPC `hunter_snapshot()` returning: total XP, per-stat total stat XP, sum of free points from events, sum of allocations per stat, today's XP per category (for cap display). The client engine derives everything else. One round-trip for the Status screen.

### 6.4 `close_days()` — structure for future penalties

For each date `d` from `coalesce(last_closed_on + 1, created_on)` up to `game_today() - 1`:

1. **Evaluate deferred quests** (`auto_kcal_range`) → completion + XP event if in range.
2. **Tally core quests** scheduled for `d` (respect `schedule_days`, `archived_at`, `created_on`, and one_time `due_on`).
3. **Write `daily_logs`** row (cleared/failed).
4. **Award daily clear** (`daily_clear` event, `free_points = 1`) if cleared.
5. _(Reserved: penalty step — Phase 2. Leave a clearly named no-op section/comment here.)_
6. Update `last_closed_on = d`.

Must be idempotent and safe under concurrent calls (lock the hunter row). Cap the backfill at 30 days per call. Return an array of per-day summaries for the System Report.

## 7. Frontend

### 7.1 Design tokens (Tailwind v4 `@theme`)

| Token        | Hex     | Use                                  |
| ------------ | ------- | ------------------------------------ |
| abyss        | #05070D | app background                       |
| dungeon      | #0B1426 | panels / System windows              |
| system       | #2E8BFF | primary, XP bars, borders            |
| system-glow  | #7FD8FF | headings, highlights, window borders |
| hunter       | #E8F1FF | primary text                         |
| steel        | #7A8BA6 | secondary text / labels              |
| penalty      | #E0243A | danger borders / backgrounds only    |
| penalty-text | #FF5A6B | red text on dark                     |
| penalty-bg   | #1A0A0F | danger window background             |
| monarch      | #6B3FD6 | reserved (Shadows, later)            |
| monarch-text | #A98BFF | reserved                             |

- Glow shadows: `system-glow: 0 0 12px rgba(127,216,255,.45), inset 0 0 8px rgba(46,139,255,.25)`; `penalty-glow: 0 0 12px rgba(224,36,58,.5)`.
- **Red is only for danger.** Never decorative.
- Dark-only app. Mobile-first, centered `max-w-md`, safe-area padding.
- Rajdhani for headings, numbers, System window titles (letter-spaced, uppercase allowed here as a stylistic choice). Inter for body.
- Build a reusable `<SystemWindow variant="system" | "penalty" | "monarch">` component (border, glow, header strip) — every panel uses it.
- Respect `prefers-reduced-motion`.

### 7.2 Screens & routes

- `/auth` — sign in / sign up.
- `/onboarding` — name, timezone, kcal range, protein target → seeds default quests → Status.
- `/` **Status** — STATUS window (name, level, rank, XP bar with numbers, 5 stats with per-stat XP progress, free points + allocate buttons with confirm), Today's XP per category vs cap.
- `/quests` — **Daily Quest** window: today's scheduled quests, core first, each with progress & state (done / pending / auto: live status). Tap to complete (with value input when goal type needs it), undo. Below: one-time quests. "Add quest" button.
- `/quests/new`, `/quests/:id/edit` — custom quest form (all fields in 6.1 that a user should set; auto tracking types not selectable for custom quests in Phase 1). Archive instead of delete.
- `/log` — two tabs: **Food** (today's entries, totals vs targets, add/delete) and **Workout** (today's workouts, add with dynamic sets, delete).
- `/report` — **System Report**: shown automatically after `close_days()` returns ≥1 closed day; per day: cleared/failed, quests done, XP gained, free points gained. "Acknowledge" returns to Status.
- Bottom nav: Status · Quests · Log.

### 7.3 Feedback moments

- Quest complete → toast-style System window: `[Quest complete] +35 XP · STR +8 · VIT +8` (show "Daily limit reached" when capped).
- Level up → full-screen modal: `LEVEL UP` → new level, `+3 free points`, rank change if any. Queue multiple level-ups into one modal showing the final level.
- All System copy strings live in `src/copy/system.ts` so I can tune wording in one place.

### 7.4 Data flow

- TanStack Query for reads; mutations call RPCs then invalidate `hunter_snapshot` and the relevant lists.
- Detect level-ups by comparing engine output before/after a mutation.
- Typed Supabase client using generated types (`npx supabase gen types typescript`).
- Loading and error states on every screen; errors in System voice, no raw exception text.

## 8. Project structure (proposal — adjust if you have a better reason, but tell me)

```
src/
  game/        config.ts, levels.ts, stats.ts, points.ts, rewards.ts, index.ts, *.test.ts
  lib/         supabase.ts, queries/, mutations/
  components/  SystemWindow.tsx, XpBar.tsx, StatRow.tsx, BottomNav.tsx, ...
  features/    auth/, onboarding/, status/, quests/, log/, report/
  copy/        system.ts
  styles/      app.css (Tailwind + @theme tokens)
supabase/
  migrations/
```

## 9. Steps & acceptance criteria

**1.1 Scaffold & design system** — Vite/React/TS/Tailwind v4, fonts, tokens, `SystemWindow`, app shell with bottom nav and placeholder-free empty routes, PWA manifest + icons (simple generated System-blue icon), `.env.example`, lint + format config.
✅ `npm run dev` shows the themed shell; `npm run build` passes; Lighthouse PWA installable.

**1.2 Game engine** — everything in section 5 as pure functions + config.
✅ `npm test` green; covers all sanity values, the property test, cap scaling, stat split rounding, allocation-doesn't-affect-cost rule, negative-XP clamp.

**1.3 Database** — migrations for section 6 (tables, constraints, indexes, RLS, RPCs, `game_config`). Include a short `supabase/README.md` explaining each RPC.
✅ I review SQL before anything is applied. After I apply: RLS check script/queries showing user A can't read user B's rows.

**1.4 Auth & onboarding** — sign up/in/out, route guards, onboarding seeding default quests.
✅ New account → onboarding → Status shows Level 1, Rank E, all stats 10, 0 free points, 4 quests seeded.

**1.5 Quests** — today list, manual complete/undo, custom quest CRUD + archive.
✅ Complete "Study" → +35 XP, INT stat XP +17; undo restores; caps enforced (verify by creating several S-rank life quests).

**1.6 Logging & auto quests** — food + workout logging, live auto-quest evaluation, kcal live status.
✅ Logging a workout completes "Train"; deleting it reverses; protein crossing target completes "Hit protein"; kcal quest shows live status but awards nothing until close.

**1.7 Status, allocation, day close, report, level-up** — full Status screen, allocation with confirm, `close_days()` on app load, System Report, level-up modal.
✅ Simulate days (provide a dev-only SQL script that backdates `hunters.created_on` / `last_closed_on` and inserts test data — never shipped in app code) → report shows correct cleared/failed days and +1 free point per clear; level-up modal fires on threshold.

**1.8 Hardening** — type-check, lint, tests, build; empty/loading/error states; mobile viewport check at 375px; README with setup steps (Windows-friendly, `npx` only).
✅ All green, plus a manual test checklist in the README that I can run in 10 minutes.

## 10. Definition of done (Phase 1)

I can install the PWA on my phone, create an account, log a day of food and a workout, complete my quests, see XP/levels/stats move correctly, open the app the next day and see a System Report with my daily-clear free point, and allocate it — with all game numbers in one config and every ledger write atomic.

---

**Start now with the Working protocol step 0: summarize, flag gaps, ask questions. No code yet.**
