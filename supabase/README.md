# Supabase: schema, RPCs and how to apply them

Everything here is **files only**. Nothing in this directory has been applied to
any database — applying is your call.

## Migrations, in order

| File                                          | What it does                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| `20261122000100_init_schema.sql`              | Tables, check constraints, indexes                                                 |
| `20261122000200_rls.sql`                      | RLS on every table, table grants, owner-only policies                              |
| `20261122000300_game_config.sql`              | **Generated.** Seeds `game_config` from `src/game/game-config.json`                |
| `20261122000400_functions_core.sql`           | Config readers, game dates, award maths, ledger writers, `hunter_snapshot`         |
| `20261122000500_functions_quests.sql`         | `complete_quest`, `undo_completion`, `allocate_points`                             |
| `20261122000600_functions_logging.sql`        | Food and workout logging, auto-quest evaluation                                    |
| `20261122000700_functions_close_days.sql`     | `close_days`, `pending_report`, `acknowledge_report`                               |
| `20261122000800_functions_onboarding.sql`     | `onboard_hunter`, `update_hunter_profile`                                          |
| `20261122000900_quest_schedule_predicate.sql` | Shared quest scheduling predicate used by `close_days`                             |
| `20261123000100_game_config_v2.sql`           | **Generated.** Phase 2 config seed (supersedes the Phase 1 seed by upsert)         |
| `20261123000200_safe_zones_schema.sql`        | Rules epoch, versioned rules, `on_rest_days`, `safe_periods`, stones, day statuses |
| `20261123000300_safe_zones_functions.sql`     | Rest/safe/streak/stone logic, Safe Zone RPCs, new `close_days`                     |
| `20261124000100_penalty_zone_schema.sql`      | `penalties`, Phase 2 `xp_events` sources and links, trial quests                   |
| `20261124000200_penalty_zone_functions.sql`   | Level curve in SQL, the award pipeline, penalties, catch-up before awards          |
| `20261124000300_penalty_zone_snapshot.sql`    | Snapshot penalty and attention blocks, privileges                                  |
| `20261125000100_gym_schema.sql`               | `exercises`, `personal_records`, the `workout_sets` upgrade (non-destructive)      |
| `20261125000200_exercise_library.sql`         | **Generated.** The global exercise library (876 rows)                              |
| `20261125000300_gym_legacy_backfill.sql`      | e1RM in SQL; Phase 1 sets linked to exercises; PR baselines, no XP                 |
| `20261126000100_gym_rewards_schema.sql`       | `bosses`, `workouts.counted_sets`, `exercises.merged_into_id`                      |
| `20261126000200_gym_rewards_functions.sql`    | Set XP, PR detection and bonuses, bosses, reversal on delete, `merge_exercise`     |

Never edit a generated config migration by hand. Change
`src/game/game-config.json`, then run `npm run gen:sql`. The newest config
migration (`20261123000100_game_config_v2.sql`) is the generated one; the
Phase 1 seed is already applied on hosted and stays frozen (forward-only). A Vitest test parses
the generated file and fails if the two drift (ADR-4).

## Setting up the hosted project

The full, numbered checklist — project creation, auth settings, linking, the
push and the read-only check — is in the root README, section
[4. Going live](../README.md#4-going-live). It is kept in one place so the two
cannot drift.

`.env.local` always points at the **local** stack. The hosted URL and key go
into Vercel's environment variables, never into `.env.local`.

## Applying the migrations

### Locally (needs Docker Desktop)

```powershell
npx supabase start
```

`start` applies everything in `migrations/` to the local database. The local
API URL and keys it prints are only for local testing.

To re-apply after a change:

```powershell
npx supabase db reset
```

That wipes and rebuilds the **local** database only.

### To your hosted project

```powershell
npx supabase link --project-ref your-project-ref
```

```powershell
npx supabase db push --remote --dry-run
```

```powershell
npx supabase db push --remote
```

> **`--remote` is required.** In the current Supabase CLI `db push` targets the
> local database by default; without the flag nothing reaches the hosted
> project.

`db push --remote` writes to your hosted database. Review the SQL first — it is
yours to run, and nothing in this repo runs it for you. Then run
`tests/hosted_readonly_check.sql` in the dashboard SQL editor.

## Verifying after you apply

With the local stack running, one command runs all of them:

```powershell
npm run db:verify
```

`scripts/local-sql.mjs` pipes each file into the local stack's own database
container and runs it with the psql inside — no psql on your machine, no
connection URL, and it works in PowerShell (which has no `<` redirection). Run
a single file with `npm run db:sql -- supabase/tests/rls_proof.sql`.

- `game_date_parity.sql` — **generated.** The same day-rollover vectors the
  TypeScript engine is tested against, so SQL and engine cannot disagree (C5).
- `quest_schedule_parity.sql` — **generated.** The same scheduling vectors the
  engine's `schedule.ts` is tested against.
- `safe_zone_parity.sql` — **generated.** Day outcome, streak and stone,
  safe period start and quota vectors, shared with the engine tests.
- `penalty_parity.sql` — **generated.** Every level of the curve, debt,
  penalty selection and transitions, and the award pipeline.
- `gym_parity.sql` — **generated.** e1RM, PR detection, the daily PR bonus
  limit, set XP and boss vectors, shared with `gym.test.ts`.
- `rls_proof.sql` — hunter A cannot read or write hunter B, the ledger rejects
  client writes, anonymous callers get nothing. Prints `RLS PROOF PASSED`.
- `smoke_game_rules.sql` — the game rules end to end: rewards, undo, auto
  quests, daily caps, late one-time quests, sealed days, day close, report,
  timezone changes. Prints `SMOKE TEST PASSED`.
- `smoke_safe_zones.sql` — 45 simulated days (rest, safe, cleared, failed,
  the epoch, a rules change), stones at streak 7/14/21 and none past 3,
  versioned rules and the Safe Zone RPCs. Prints `SAFE ZONES PASSED`.
- `smoke_penalty_zone.sql` — every option, trial expiry, repayment and
  reopening, redeemed never reopens, both directions of the reopened-debt
  race, one open penalty under 5 failures per mode, stones in every state,
  the diet trial and the source x modifier matrix. Prints `PENALTY ZONE PASSED`.
- `smoke_gym.sql` — set XP and the shared daily 20, the fitness cap, baselines,
  the 3rd PR of a day, bosses and their reversal, debt repayment on workout
  and PR awards, the exercise merge, the Phase 1 payload. Prints `GYM PASSED`.

The test scripts run inside a transaction and end with `ROLLBACK`. They create
throwaway `auth.users` rows, so run them against a local or test database.
They are plain SQL, so each can also be pasted whole into the dashboard SQL
editor of a test project.

## Security model (ADR-3, C1)

- The client may **read** its own rows and **write only its own quests**.
  Everything else goes through an RPC.
- `xp_events` has a SELECT policy and nothing else. The ledger is append-only:
  undo appends a negating reversal (ADR-1), it never deletes.
- Table privileges are revoked from `anon` and `authenticated` first, then
  granted back narrowly, so a stray policy cannot open a write path on its own.
- Every ledger-writing function is `SECURITY DEFINER` with `set search_path =
public`, asserts `auth.uid()` and scopes every statement to that uid. A
  caller-supplied user id is never trusted.
- Internal helpers (`award_quest_completion`, `reverse_quest_completion`,
  `evaluate_auto_*`, `auto_quest_for`, config readers) have **no** execute grant
  for client roles. Only the RPCs below are callable.

> **Writing a new function?** Supabase's default privileges grant `EXECUTE` on
> every new function in `public` to `anon` and `authenticated` **by name**, so
> `revoke ... from public` does _not_ take it away. Always revoke from
> `public, anon, authenticated` and then grant back only what the client needs.
> `rls_proof.sql` checks every function in `public` straight from the catalog
> against the explicit RPC list, so a forgotten revoke fails it.

## RPC reference

Every function returns `jsonb` unless stated otherwise. Errors are raised as
short stable tokens — the client maps them to System copy, never shows them raw.

### Reading

| RPC                 | Returns                                                                                                                                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game_today()`      | The hunter's current game date (`date`).                                                                                                                                                                                                                                                             |
| `hunter_snapshot()` | One row for the Status screen: profile, `game_today`, total XP, the five stat-XP totals, free points from events, allocated points per stat, today's XP per category, today's effective diet targets, the daily caps, and how many closed days are unacknowledged. Returns `null` before onboarding. |
| `pending_report()`  | `{ days: [...] }` — closed days not yet acknowledged, newest first, each with status, core counts, XP and free points gained.                                                                                                                                                                        |

### Writing

| RPC                                                                           | What it does                                                                                                                                                                                                                                                                                                                                                | Raises                                                                                                                                                                            |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboard_hunter(name, timezone, kcal_min, kcal_max, protein_target_g)`        | Creates the hunter, the first diet-target version (C8) and the four default quests, then returns the snapshot.                                                                                                                                                                                                                                              | `ALREADY_ONBOARDED`, `INVALID_TIMEZONE`, `INVALID_KCAL_RANGE`                                                                                                                     |
| `update_hunter_profile(name, timezone, kcal_min, kcal_max, protein_target_g)` | Hunter Settings. Name and timezone apply at once; diet targets are versioned to take effect from the next game day (C4/C8).                                                                                                                                                                                                                                 | `HUNTER_NOT_FOUND`, `INVALID_TIMEZONE`, `INVALID_KCAL_RANGE`                                                                                                                      |
| `complete_quest(quest_id, value)`                                             | Manual quests only. Validates the goal, writes the completion and its capped XP event in one transaction. A dated one-time quest can be completed late and scores on the completion day (G10).                                                                                                                                                              | `HUNTER_NOT_FOUND`, `QUEST_NOT_FOUND`, `QUEST_ARCHIVED`, `QUEST_IS_AUTO`, `QUEST_NOT_SCHEDULED_TODAY`, `QUEST_NOT_DUE_YET`, `ALREADY_COMPLETED`, `VALUE_REQUIRED`, `GOAL_NOT_MET` |
| `undo_completion(completion_id)`                                              | Same game day only. Marks the completion reversed and appends the negating event.                                                                                                                                                                                                                                                                           | `COMPLETION_NOT_FOUND`, `SEALED_DAY`                                                                                                                                              |
| `log_food(name, kcal, protein_g)`                                             | Writes today's entry, then re-evaluates `auto_protein_min`.                                                                                                                                                                                                                                                                                                 | `HUNTER_NOT_FOUND`                                                                                                                                                                |
| `delete_food(id)`                                                             | Removes a **today** entry and re-evaluates protein.                                                                                                                                                                                                                                                                                                         | `ENTRY_NOT_FOUND`, `SEALED_DAY`                                                                                                                                                   |
| `log_workout(title, notes, sets)`                                             | Writes today's workout and its sets, re-evaluates `auto_workout`, then pays set XP, detects records (PR bonuses) and defeats bosses. `sets` is a JSON array, in order, of `{exercise_id?, exercise_name?, set_type?, reps?, weight_kg?, duration_s?, distance_m?}`; the Phase 1 shape `{exercise_name, reps, weight_kg}` still works and is linked by name. | `HUNTER_NOT_FOUND`, `INVALID_SETS`, `EXERCISE_NOT_FOUND`, `EXERCISE_ARCHIVED`                                                                                                     |
| `delete_workout(id)`                                                          | Removes a **today** workout (sets cascade): reverses its set XP, PR bonuses and records and any boss it defeated, then re-evaluates.                                                                                                                                                                                                                        | `WORKOUT_NOT_FOUND`, `SEALED_DAY`                                                                                                                                                 |
| `create_boss(exercise_id, target_weight_kg, target_reps, difficulty, name)`   | A lift target on a strength exercise (reps default from config). At most 5 active.                                                                                                                                                                                                                                                                          | `EXERCISE_NOT_FOUND`, `BOSS_KIND_NOT_ALLOWED`, `INVALID_BOSS`, `BOSS_LIMIT`                                                                                                       |
| `update_boss(id, target_weight_kg, target_reps, difficulty, name)`            | Edits an undefeated boss.                                                                                                                                                                                                                                                                                                                                   | `BOSS_NOT_FOUND`, `BOSS_DEFEATED`, `INVALID_BOSS`                                                                                                                                 |
| `archive_boss(id)`                                                            | Retires an undefeated boss. A defeated boss is a trophy and stays.                                                                                                                                                                                                                                                                                          | `BOSS_NOT_FOUND`, `BOSS_DEFEATED`                                                                                                                                                 |
| `merge_exercise(from_custom_id, into_exercise_id)`                            | Merges an own custom exercise into a library or own exercise of the same kind. See below.                                                                                                                                                                                                                                                                   | `EXERCISE_NOT_FOUND`, `EXERCISE_ARCHIVED`, `MERGE_INTO_SELF`, `MERGE_KIND_MISMATCH`                                                                                               |
| `allocate_points(stat, points)`                                               | Appends a permanent allocation. Availability is checked client-side by the engine (ADR-5).                                                                                                                                                                                                                                                                  | `UNKNOWN_STAT_TAG`, `POINTS_MUST_BE_POSITIVE`, `HUNTER_NOT_FOUND`                                                                                                                 |
| `close_days()`                                                                | Closes every unclosed game day before today: settles the deferred calorie quest, tallies core quests, writes `daily_logs`, awards the daily clear, advances `last_closed_on`. Idempotent, locks the hunter row, closes at most 30 days per call and reports `more_pending` (G8).                                                                            | `HUNTER_NOT_FOUND`                                                                                                                                                                |
| `acknowledge_report()`                                                        | Marks every unacknowledged closed day as seen (G9).                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                 |
| `choose_penalty(choice)`                                                      | Standard only: `trial`, `debt` (20 %) or `weakened` for the pending penalty.                                                                                                                                                                                                                                                                                | `NO_PENDING_CHOICE`, `INVALID_PENALTY_CHOICE`                                                                                                                                     |
| `acknowledge_penalty()`                                                       | Marks a Lenient debt, a Hardcore trial or an escalation as seen.                                                                                                                                                                                                                                                                                            | —                                                                                                                                                                                 |
| `redeem_penalty(id)`                                                          | Spends a Redemption Stone: debt forgiven, trial removed, Weakened ended. Not in Hardcore.                                                                                                                                                                                                                                                                   | `PENALTY_NOT_FOUND`, `PENALTY_NOT_OPEN`, `STONES_FROZEN`, `NO_STONES`                                                                                                             |
| `update_hunter_rules(penalty_mode, rest_days)`                                | Penalty mode and 0–2 rest weekdays, versioned from the next game day; diet targets carried forward.                                                                                                                                                                                                                                                         | `HUNTER_NOT_FOUND`, `INVALID_PENALTY_MODE`, `INVALID_REST_DAYS`                                                                                                                   |
| `start_safe_period(kind, days)`                                               | Sick/Travel for 1–7 days. Starts today if called before today's warning time, otherwise tomorrow (never before the rules epoch). Max 10 safe days in any rolling 30.                                                                                                                                                                                        | `HUNTER_NOT_FOUND`, `INVALID_SAFE_KIND`, `SAFE_PERIOD_LENGTH`, `SAFE_PERIOD_OVERLAP`, `SAFE_QUOTA_EXCEEDED`                                                                       |
| `end_safe_period(id)`                                                         | Ends a period from the next game day (a period not yet started is cancelled); unused days return to the quota.                                                                                                                                                                                                                                              | `SAFE_PERIOD_NOT_FOUND`, `SAFE_PERIOD_NOT_ACTIVE`                                                                                                                                 |

### Day boundaries (C5, C7)

A game day starts at **03:00** wall-clock time in the hunter's timezone, so a
session that runs past midnight still belongs to the day it started. The hour
lives in `game_config.game_day_start_hour`, generated from the same JSON the
engine reads, and `game_date_at()` mirrors `gameDateAt()` in
`src/game/gameDate.ts` exactly.

`game_today()` is additionally clamped to `last_closed_on + 1`, so moving the
timezone west can never reopen a day that has already been sealed.

### Safe Zones (Phase 2)

- **Rules epoch.** `hunters.rules_from` is the first game day judged by Phase 2
  rules. Existing hunters got the day after their game day at migration time;
  new hunters get their first day. Earlier days keep Phase 1 rules, closed or
  not, so nothing is re-evaluated retroactively.
- **Day status** precedence is `safe > rest > cleared/failed`. A rest day
  tallies only core quests with `on_rest_days`; with none it is `rest`, and it
  never fails. Safe days pay nothing and leave the streak alone.
- **Streak** (`daily_logs.streak`): counted clears extend it, a failure resets
  it, rest/safe/zero-core days hold it. Every 7th earns a Redemption Stone in
  the append-only `redemption_stone_events` (max 3 held, none in Hardcore).
- `hunter_snapshot().safe_zones` carries today's and tomorrow's rules, the
  streak, stones held, current and upcoming safe periods and the bookable days.

### Penalty Zone (Phase 2)

**State machine** (enforced by the `penalties_guard_transition` trigger;
`penalty_transition_allowed()` is the rule, parity-tested against
`canTransition` in `src/game/penalty.ts`):

```
pending_choice ──► trial_active ──► cleared
      │                 └─────────► debt_active (escalated: deadline passed or another failure)
      ├──► debt_active ──► cleared ──► debt_active (only a debt, when a reversal takes a repayment back)
      ├──► weakened_active ──► cleared (at the close of its 2nd day)
      └──► any open state ──► redeemed (a stone; never reopens)
```

- **One open penalty** per hunter: a partial unique index. A failure while one
  is open escalates a pending choice or a trial once (30 % debt); anything else
  records nothing. Lenient starts as a 10 % debt, Hardcore as a trial.
- **Award pipeline.** Every XP event is written by `apply_award()` (base, cap,
  Weakened, debt repayment, insert) and undone by `reverse_award()`, which
  also reverses the linked repayment. Debt left is derived from the repayment
  events, never stored. Cap room counts only quest and workout awards and
  their reversals.
- **Catch-up before awards.** Every RPC that can award or reverse XP first
  closes all pending game days (`catch_up_days`), so yesterday's penalty
  always exists before today's first award. A reversal can therefore only
  reopen a debt cleared today, while it is still the open penalty.
- **Trials** are quests of `type = 'trial'`, linked to their penalty and
  immutable to the client. The deadline is checked lazily before every close
  and every award; a trial completion is final.
- `hunter_snapshot()` carries `penalty`, `penalty_options` (the concrete
  consequences for the choice screen), `weakened_stat_today` and an
  `attention` block (report days, pending choice, pending acknowledgement).

### Exercise library (Phase 2)

`data/exercise-library.json` is a trimmed snapshot of
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) at commit
`f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`, released under **The Unlicense**
(a public domain dedication). It keeps id, name, category, equipment, primary
and secondary muscles, mechanic and force - no images, nothing fetched at
runtime. `npm run gen:sql` turns it into the seed migration; each library
category maps to an XP kind (strength, cardio or mobility) in
`game-config.json`, and an unknown category stops the generator.

- Library rows have `user_id` null and are readable by every signed-in
  hunter; custom exercises belong to their hunter (create, rename, archive).
  An exercise's kind never changes once created.
- The gym migration linked every Phase 1 set to an exercise by
  case-insensitive exact name, created a custom exercise for every name the
  library does not know, and recorded each exercise's Phase 1 bests as PR
  **baselines** with no XP. `exercise_name` is kept as logged.
- Rehearse it on Phase 1-style history (local only):

  ```powershell
  npx supabase db reset --version 20261124000300
  ```

  ```powershell
  npm run db:sql -- supabase/dev/rehearsal_gym_seed.sql
  ```

  ```powershell
  npx supabase migration up
  ```

  ```powershell
  npm run db:sql -- supabase/dev/rehearsal_gym_check.sql
  ```

### Gym rewards (Phase 2)

Everything is paid through `apply_award` and taken back through
`reverse_award`, inside `log_workout` / `delete_workout`:

- **Set XP:** one `workout` event per workout, 2 XP per working set
  (warmups 0), at most 20 working sets per game day across the day's live
  workouts (`workouts.counted_sets`). Fitness category: capped and repays
  debt. Stat XP by exercise kind (strength STR, cardio AGI, mobility VIT).
  The Train quest is evaluated first, exactly as in Phase 1.
- **Records:** per strength exercise, `e1rm` and `max_weight`. The best is
  derived (max of live `personal_records`). No prior record: a baseline, no
  XP. One 25 XP `pr` bonus per record-breaking set, at most 2 a game day,
  cap-exempt, repays debt. A record past the limit is stored unpaid.
- **Bosses:** defeated by the first working set meeting weight and reps; a
  `boss` event of 2x the difficulty XP + 1 free point, cap- and
  debt-exempt. Deleting the workout reverses it and the boss is undefeated.
- **Delete:** reverses the bosses, PR bonuses, records and set XP of that
  workout. If the deleted records hid an older best, that set becomes a
  baseline again (`rebase_pr_baselines`), so the next PR is judged fairly.

**Merging an exercise** (`merge_exercise`): for Phase 1 names that became
custom exercises (e.g. "Squat") but belong to a library exercise. The owner's
sets and bosses move to the target (on sealed days too; `exercise_name` stays
as logged), the source's records are retired, the target gets baselines from
the combined history (no XP), and the source is archived with
`merged_into_id`. A set later logged by the old name follows the link. No
`xp_events` row is written; repeating a merge is a no-op.

### The Penalty Zone hook

`close_days()` has a clearly marked no-op section between writing the day log
and advancing `last_closed_on`. Phase 2 inserts the penalty step there; nothing
above or below it needs rewriting (brief 6.4 step 5).

## Simulating days (dev only)

`dev/simulate_days.sql` winds a hunter back so `close_days()` has real days to
settle and the System Report has something to say.

```powershell
npm run sim:days
```

By default it lives four days back: three fully lived (cleared, one free
point each) and yesterday with food only (failed). The window is judged by
Phase 2 rules, so open the app afterwards and you get the System Report, then
the Penalty choice, then any level-up - in that order. A previous run's open
penalty is closed first, so every run starts a fresh scenario.

Useful scenarios for the Penalty Zone (`sim.mode`: 0 lenient, 1 standard,
2 hardcore):

| Scenario                  | Command                                                                       |
| ------------------------- | ----------------------------------------------------------------------------- |
| Standard choice           | `npm run sim:days`                                                            |
| Lenient auto-debt         | `npm run sim:days -- --set sim.mode=0`                                        |
| Hardcore trial            | `npm run sim:days -- --set sim.mode=2`                                        |
| Escalation (two failures) | `npm run sim:days -- --set 'sim.lived={4,3}' --set 'sim.food_only={2,1}'`     |
| A stone, then a failure   | `npm run sim:days -- --set sim.days_back=8 --set 'sim.lived={8,7,6,5,4,3,2}'` |

Override the scenario (quote the arrays, or PowerShell reads the braces):

```powershell
npm run sim:days -- --set sim.days_back=9 --set 'sim.lived={9,8,7}' --set 'sim.food_only={}'
```

Unlike the test scripts it does **not** roll back, and it deletes the ledger
rows inside its own window so a re-run starts clean. Only a dev script may do
that: the app never erases history, it appends reversals (ADR-1).

### Why it can never touch the hosted project

It rewrites history, so it is isolated three ways:

1. **Not in the app.** It is a SQL file under `supabase/dev/`. Nothing in `src/`
   references it and none of its identifiers appear in the production bundle.
2. **No URL to point anywhere.** `npm run sim:days` pipes it into the local
   stack's own database container. The runner only accepts `sim.*` settings
   with integer values, so it cannot be used to spoof the checks below.
3. **The SQL refuses on its own**, before writing anything, even if someone
   runs it by hand against the wrong database:
   - any **network** session is refused — it only runs over the local
     container's unix socket, and the hosted project is reachable only over
     the network;
   - any database without the **local stack's identity** is refused — the
     Supabase CLI sets `app.settings.jwt_secret` to its public demo value
     locally, which no hosted project uses (compared by hash, so the literal
     is not committed).

   Both must pass. If a future CLI drops either signal, the script refuses
   even locally — the safe way to fail.
