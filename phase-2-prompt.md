# THE SYSTEM — Phase 2 Build Brief (for Claude Code)

You are continuing as my senior full-stack engineer on The System. Phase 1 is complete, deployed, and **holding my real data on the hosted Supabase project**. This brief covers **Phase 2: the Penalty Zone + Safe Zones, and Gym depth**.

Everything agreed in Phase 1 still stands: the Phase 1 brief, ADR-1 to ADR-7, all C1–C8 and G1–G14 decisions, the 03:00 game-day rollover, the mutation `onSettled` re-sync rule, config parity via `game-config.json`, schedule parity vectors, and the `db:verify` / `sim:days` tooling. Where this brief extends those, it says so. If anything here contradicts a Phase 1 decision, **flag it — don't silently pick one**.

---

## 0. Working protocol

1. **No code yet.** First reply with (a) your understanding of scope in 10–15 bullets, (b) contradictions/gaps, including any conflicts with what's already in the repo, (c) questions. Wait for my answers.
2. Build in **Steps 2.1 – 2.9** (section 8), one at a time. After each: what you built, files changed, how I verify (exact commands), deviations. Then wait for **"continue"**.
3. Ambiguity on architecture, schema or game rules → ask.

## 1. Hard rules

All Phase 1 hard rules still apply (no `git push`, `npx` only, no service_role key in frontend, no files outside the project, no new dependencies without asking, no out-of-scope features, no hard-coded game numbers, no formula changes without asking, no TODO stubs, strict TypeScript). New for Phase 2:

- **Real data now exists on hosted.** Every migration must be **non-destructive and forward-only**: no dropping or rewriting columns that hold data, no editing or deleting existing `xp_events` rows, no retroactive XP for Phase 1 history.
- **Never** touch the hosted project. I run `db push` myself after the migration rehearsal (2.9).
- New rules apply **from the game day after deploy** — never re-evaluate days that are already closed.
- Every new SQL/TS duplicated rule gets **parity vectors** (same pattern as config and schedule parity).
- The RLS proof, the privilege check (the explicit list of RPCs `authenticated` may execute) and the smoke test are **extended for every new table and RPC**. The anon/authenticated privilege loop must stay exhaustive.

## 2. Scope

### In scope
**Part A — Penalty Zone + Safe Zones**
- Warning window with live countdown to game-day end
- Penalty creation at day close for failed days
- Penalty choice: Survival Trial / XP Debt / Weakened
- Escalation, the one-open-penalty rule, Redemption Stones
- Penalty modes: Lenient / Standard / Hardcore
- Rest days, Sick/Travel mode, clear streaks

**Part B — Gym depth**
- Exercise library (global, seeded) + custom exercises
- Workout logger v2: library search, previous-session prefill, rest timer, cardio entries
- Per-set XP and stat XP
- PR detection (e1RM + heaviest weight) with bonus XP
- Boss fights (user-defined lift targets)
- Exercise history with a hand-built SVG sparkline

### Out of scope (do NOT build)
Gates, Rank-Up Trials, weekly quests, titles/achievements, Shadows, diet depth (barcode, Open Food Facts, AI logging, weigh-ins/bodyweight), push notifications, sound effects, party/multi-user features, exercise images, charting libraries, editing past days' logs (C5 still holds: today only), Capacitor/native.

## 3. Game rules — Part A: Penalty Zone & Safe Zones

All numbers go into `game-config.json`.

### 3.1 Penalty modes (versioned setting)
| | Lenient | Standard (default) | Hardcore |
|---|---|---|---|
| Warning starts | 21:00 | 23:00 | 23:00 |
| On a failed day | XP Debt 10%, applied automatically (no choice screen) | Choice of 3 options | Survival Trial only |
| Redemption Stones | yes | yes | none earned, none usable |

- Times are local game time. The game day ends at **03:00** (rollover), so Standard's warning is a 4-hour countdown.
- The mode is **versioned like diet targets (C8)**: a change takes effect from the next game day, so nobody can dodge a failing day by switching modes at 02:50. Extend the existing `hunter_target_history` (or propose a renamed `hunter_rules_history`) with `penalty_mode` and `rest_days`.

### 3.2 Warning window
- From warning time until day end, if any core quest for today is incomplete: a red `SystemWindow variant="penalty"` on Status and Quests: `Daily quest incomplete. Penalty Zone in HH:MM:SS.`
- The countdown is a pure engine function `penaltyCountdown(now, timezone, config)` (no `Date.now()` inside), unit-tested across the rollover and DST changes (Europe/Berlin last Sunday of March/October).
- Not shown on rest days or safe days, or when all core quests are done.

### 3.3 Penalty creation (close_days step 5)
For a closed day with status `failed`:
- **One open penalty max.** If none is open → create one (`pending_choice` in Standard; `debt_active` in Lenient; `trial_active` in Hardcore).
- If one is already open and **not yet escalated**, escalate it once: pending/trial → XP Debt at the escalated rate (30%). If it's already escalated or is a debt/weakened penalty → record nothing more. Failures never stack beyond one escalation.
- Record on the penalty which day triggered it and which core quests were missed (snapshot of quest ids, categories, stat tags).

### 3.4 The three options
**Survival Trial**
- Category = the most common category among the missed core quests; ties broken by config order `fitness, diet, life`.
- Created as a special quest (`type = 'trial'`, non-core, linked to the penalty) from a config template:

| Category | Template | Goal | Stats |
|---|---|---|---|
| fitness | Survival circuit | 15 min (duration) | STR, AGI |
| diet | Log every meal | ≥ 3 food entries today (auto-tracked) | VIT |
| life | Focus trial | 45 min (duration) | INT |

- **Hard rule:** a trial is never about eating less, and never a calorie or deficit target. Diet trials are logging-only.
- Template sizes are capped in config. No user-editable trial sizes.
- Deadline = choice time + 24 h (config). Completing it → penalty `cleared`, plus a `trial` XP event of **20 XP** (cap-exempt, stat XP per template, G1 split rule).
- If the deadline passes without completion → escalate to XP Debt at 30%. Deadlines are checked lazily in the same day-close call (ADR-7).

**XP Debt**
- `debt_amount = round(rate × xpToNext(level at creation))`. Rates: Lenient 10%, Standard 20%, escalated 30%.
- While debt remains, every positive **quest / workout / PR** award (after caps) has `floor(xp / 2)` diverted into a `debt_repayment` event (negative XP, linked to both the penalty and the award via a new `related_event_id`). Stat XP is untouched. Trial, boss and daily-clear awards are exempt.
- **`debt_remaining` is derived** = `debt_amount − Σ repayments` (ADR-1). Never store a mutable remainder.
- Debt creation itself never subtracts XP, so **a hunter can never lose a level**. Unit-test this property.
- Reversing an award also reverses its linked repayment. If that reopens a cleared debt, the penalty returns to `debt_active`.

**Weakened**
- Stat = the stat appearing most often in the missed core quests' stat tags; ties broken by config order `STR, AGI, VIT, INT, SENSE`.
- For **2 game days** (the choice day and the next), that stat earns **0 stat XP** from all sources. Other stats and XP are unaffected. The event records `weakened = true` for the zeroed stat.
- Red `Weakened` tag on that stat on Status until it expires.

### 3.5 Choice flow
- After `close_days()`, the order is **System Report → Penalty choice → Level-up modal**. The choice screen blocks navigation until a choice is made. In Lenient mode it's just an acknowledgement.
- The choice screen shows the triggering day, the missed quests, and the three options with their concrete consequence. For example: `XP Debt: 70 XP — half of your XP goes to repayment until it's cleared`, or `Weakened: VIT gains no stat XP until Wednesday`.

### 3.6 Redemption Stones
- **Streak** = consecutive `cleared` days with `core_total > 0`. `rest` and `safe` days neither break nor extend it. A `failed` day resets it. A cleared day with `core_total = 0` (G6) is neutral.
- Every time the streak reaches a multiple of 7 at close, earn **1 stone** if fewer than **3** are held. Store this in an append-only `redemption_stone_events` table (+1 earned / −1 spent). Held = sum.
- Spending a stone on any open penalty → `redeemed`: debt forgiven, trial removed, Weakened ended immediately. Confirm dialog first.
- Hardcore: no stones are earned or spendable.

### 3.7 Rest days
- 0–2 fixed weekdays (config max 2), part of the versioned rules (next game day).
- Quests get a new flag `on_rest_days bool default false`. On a rest day, the core tally counts only core quests with `on_rest_days = true`. The board shows all quests but marks the others "Rest day — optional".
- Rest day with ≥1 such quest, all done → `cleared` + free point. Rest day with none → status `rest`, no free point. **A rest day never creates a penalty.**
- This changes the board/tally predicate → extend the schedule parity vectors.

### 3.8 Sick / Travel mode
- Activate for 1–7 consecutive game days. It **starts today only if activated before today's warning time**, otherwise tomorrow. It can be ended early (from the next game day).
- Days in a safe period → status `safe`: no penalty, no free point, streak neutral.
- Quota: at most **10 safe days in any rolling 30 days** (config). Refuse beyond that, in System voice.
- Stored as `safe_periods(user_id, kind 'sick'|'travel', start_on, end_on, created_at, ended_early_on)`.

### 3.9 Day statuses
`daily_logs.status` extends to `cleared | failed | rest | safe` (update the check constraint non-destructively). The precedence when evaluating a day is **safe > rest > cleared/failed**.

## 4. Game rules — Part B: Gym depth

### 4.1 Exercise library
- Source: **free-exercise-db** (github.com/yuhonas/free-exercise-db). **Verify its license before importing** and tell me what it is. Pin a specific commit.
- Commit a **trimmed JSON snapshot** (name, category, equipment, primary/secondary muscles, mechanic, force), with no images and no runtime fetching. Generate the seed migration from it with a script (same pattern as the config generator), with a drift test.
- `exercises` table: global rows (`user_id null`, read-only to everyone authenticated) + custom rows (`user_id` = owner, full owner CRUD, archive instead of delete).
- Each exercise maps to a **kind** used for XP: `strength` or `cardio` (map library categories in config; e.g. cardio/plyometrics → cardio, everything else → strength). Custom exercises choose their kind.

### 4.2 Workout schema upgrade (non-destructive)
- `workout_sets` gains: `exercise_id` (nullable for legacy rows), `set_type 'warmup' | 'working'` (default working), `duration_s`, `distance_m` (cardio).
- **Legacy migration:** map Phase 1 `exercise_name` values to library exercises by case-insensitive exact name. Unmatched names become custom exercises automatically. Keep `exercise_name` as-is.
- **PR baselines:** compute existing bests from Phase 1 sets as baseline `personal_records` with **no XP**.

### 4.3 Per-set XP
- **2 XP per working set** (warmups give 0), counting at most **20 working sets per game day** across all workouts.
- Stat XP = half of the set XP: strength → STR, cardio → AGI (G1 split rules, Weakened applies).
- Recorded as **one `workout` event per workout** (not per set), category `fitness`, **subject to the fitness cap (150)** and to debt repayment. Deleting the workout reverses it.
- The existing auto `Train` quest is unchanged (still +35, as Phase 1).

### 4.4 PR detection
- **e1RM (Epley)** = `weight × (1 + reps / 30)`, only for working sets with 1–12 reps (config). **Heaviest weight** = max weight for ≥1 rep.
- Per exercise, two PR kinds: `e1rm` and `max_weight`. The first time an exercise is ever logged sets a baseline: **no PR bonus**.
- A new PR → `personal_records` row + **25 XP** `pr` bonus event (fitness category, **exempt from the category cap**, max **2 PR bonuses per game day**, subject to debt repayment). Stat XP 10 → STR.
- Detection runs inside `log_workout` (atomic). `delete_workout` reverses any PRs and bonuses it created. The current best is **derived** (max of non-reversed records).
- Pure-function twin in the engine (`e1rm`, `isPr`) with parity vectors against the SQL.

### 4.5 Boss fights
- User-created: exercise, target weight (kg), target reps (default 1), difficulty E–S, optional name (e.g. "Igris: 100 kg squat"). Max 5 active bosses (config).
- Defeated automatically inside `log_workout` when a working set meets weight ≥ target **and** reps ≥ target reps.
- Reward: **2× the difficulty XP** (cap-exempt, debt-exempt) + **1 free point**, as a `boss` event. Defeated bosses are kept as a trophy list.
- Deleting the workout that defeated a boss → reversal, and the boss is undefeated again.

### 4.6 Logger UX
- **Start workout** → add exercises via search (name, muscle, equipment filters) → sets.
- **Prefill** each new exercise with the last session's sets: `Last time: 3 × 8 @ 60 kg`. Logging a set should take one tap when you repeat the previous one.
- **Rest timer** auto-starts after a working set: default 90 s (configurable in Settings), ±15 s buttons, vibration on finish (Vibration API, fails silently where unsupported). It survives navigation within the app (persist the start timestamp locally). Respects reduced motion.
- **Cardio** entries take duration and/or distance instead of reps/weight.
- **Exercise history**: sessions list + a hand-built SVG sparkline of best e1RM per session (no chart library).
- Toasts: `[NEW RECORD] Squat e1RM 92.5 kg · +25 XP`, `[BOSS DEFEATED] Igris · +100 XP · +1 free point`.

## 5. Data model changes (summary)
New: `penalties`, `redemption_stone_events`, `safe_periods`, `exercises`, `personal_records`, `bosses`.
Changed: `xp_events` (new `source_type` values `trial | debt_repayment | workout | pr | boss`, `related_event_id`, `penalty_id`, `weakened` flag), `quests` (`type` adds `trial`, `on_rest_days`, `penalty_id`), `workout_sets` (4.2), `daily_logs` (status values), versioned hunter rules (`penalty_mode`, `rest_days`), the hunter settings (`rest_timer_s`).

Propose the exact DDL in Step 2.2/2.5 for my review. Every new table: owner RLS (global exercise rows read-only), indexes on `(user_id, occurred_on)` or equivalent, check constraints rather than enums (G11).

**Penalty state machine:** `pending_choice → trial_active | debt_active | weakened_active → cleared | redeemed | expired`, plus `trial_active → debt_active (escalated)`. Enforce valid transitions in SQL, and document the state machine in `supabase/README.md`.

## 6. Award pipeline (single path)

All XP-granting RPCs must go through **one internal award function** that applies, in this order:
1. Base amount (difficulty / sets / PR / boss / trial)
2. Category cap (if applicable)
3. Weakened (zero the weakened stat's stat XP)
4. Debt repayment (if applicable) → linked `debt_repayment` event
5. Insert event(s)

Reversal goes through one internal reversal function that undoes the award **and** its linked events. No RPC may insert into `xp_events` any other way. Add a smoke-test section that runs every award source through every modifier combination.

## 7. Frontend summary
- Status: streak, stones held, active penalty window (type, what's left: trial deadline / debt remaining / weakened until), Weakened tag on the stat.
- Quests: warning countdown window, trial quest pinned at the top in the penalty style, rest-day markers, Bosses section.
- New screens: Penalty choice, Safe Zones (in Settings: rest days, penalty mode with "applies from tomorrow", Sick/Travel activation with quota left), Workout logger v2, Exercise picker, Exercise history, Boss create/edit.
- All new copy in `src/copy/system.ts`. Red only for the penalty and danger, Monarch purple stays reserved.

## 8. Steps & acceptance criteria

**2.1 Engine & config:** all new pure functions (countdown, debt amount/split, derived debt remaining, penalty selection rules for trial category and weakened stat, streak and stone earning, rest/safe day precedence, e1RM/PR checks, set XP) + config keys + tests. Extend parity vectors (config, schedule with rest/safe days, PR).
✅ Tests green, including "never lose a level under debt", DST countdown cases, tie-break rules, stone cap at 3.

**2.2 DB — Safe Zones:** versioned rules (`penalty_mode`, `rest_days`), `on_rest_days`, `safe_periods` + quota, new day statuses, streak + stone events in `close_days`.
✅ Simulated weeks show correct rest/safe/cleared/failed statuses, a stone at day 7 and 14, none beyond 3, and a mode change applying only from the next day.

**2.3 DB — Penalty Zone:** `penalties`, close_days step 5, `choose_penalty`, trials, lazy deadline escalation, the award pipeline (section 6) with debt and Weakened, `redeem_penalty`.
✅ Smoke tests for every path: each option chosen, trial cleared, trial expired → 30% debt, repayment until cleared, reversal reopening debt, Weakened zeroing only its stat for 2 days, stone redemption for each state, the one-open-penalty rule under 5 consecutive failures, Lenient and Hardcore behavior.

**2.4 UI — Penalty & Safe Zones:** countdown window, Report → Penalty → Level-up order, choice screen, active penalty displays, Safe Zones settings, stones and streak.
✅ Browser walkthrough of each option end to end via `sim:days`.

**2.5 DB — Exercise library & schema upgrade:** license check, snapshot + generator + drift test, `exercises`, `workout_sets` changes, legacy mapping, PR baselines.
✅ Migration rehearsal on a database holding Phase 1-style history (see 2.9): legacy sets mapped or converted to custom exercises, baselines created, zero new XP events.

**2.6 DB — Gym XP, PRs, bosses:** set XP via the award pipeline, PR detection with the daily bonus limit, bosses, full reversal on `delete_workout`.
✅ Smoke tests: set cap at 20, fitness cap interaction, baseline-no-bonus, 3rd PR in a day gives no bonus, boss defeat + reversal, debt repayment on workout and PR awards.

**2.7 UI — Logger v2:** picker/search, prefill, rest timer, cardio, history + sparkline, bosses, toasts.
✅ Log a realistic session at 375 px width in under 2 minutes, with one-tap repeat sets, the timer surviving navigation, and PR and boss toasts firing.

**2.8 Simulator & hardening:** extend `sim:days` (failed streaks, rest/safe days, penalty choices, workouts with PRs), extend `db:verify` (RLS proof, privilege list, smoke tests, all parity vectors). Typecheck, lint, format, build, and loading/error/empty states for all new screens.
✅ All green, plus an updated 10-minute manual checklist.

**2.9 Migration rehearsal & hosted checklist:**
- Rehearsal: on the local stack, apply **only the Phase 1 migrations**, generate ~30 days of realistic Phase 1 history with the simulator, then apply the Phase 2 migrations and run `db:verify`. Prove the Phase 1 data is intact (event counts, totals, levels unchanged before/after).
- Write the hosted checklist for me: take a backup first (`npx supabase db dump` for schema and `--data-only` for data, saved locally), `db push`, run the read-only hosted verification script (updated for the new tables and RPC list), then deploy.
✅ Rehearsal report showing before/after totals identical. **Stop after the report.** I run the hosted steps.

## 9. Definition of done (Phase 2)
On my phone: I miss a day, get a fair choice the next morning, and each option behaves exactly as described. Rest and sick days protect me, and streaks earn stones I can spend. I log a real gym session in under 2 minutes with prefilled sets and a rest timer, and I see PRs and boss defeats reward me. All my Phase 1 history is untouched, and every XP change still flows through one audited award path.

---

**Start with Working protocol step 0: summarize, flag gaps and conflicts with the current repo, ask questions. No code yet.**
