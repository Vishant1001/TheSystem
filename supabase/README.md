# Supabase: schema, RPCs and how to apply them

Everything here is **files only**. Nothing in this directory has been applied to
any database — applying is your call.

## Migrations, in order

| File                                      | What it does                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `20261122000100_init_schema.sql`          | Tables, check constraints, indexes                                         |
| `20261122000200_rls.sql`                  | RLS on every table, table grants, owner-only policies                      |
| `20261122000300_game_config.sql`          | **Generated.** Seeds `game_config` from `src/game/game-config.json`        |
| `20261122000400_functions_core.sql`       | Config readers, game dates, award maths, ledger writers, `hunter_snapshot` |
| `20261122000500_functions_quests.sql`     | `complete_quest`, `undo_completion`, `allocate_points`                     |
| `20261122000600_functions_logging.sql`    | Food and workout logging, auto-quest evaluation                            |
| `20261122000700_functions_close_days.sql` | `close_days`, `pending_report`, `acknowledge_report`                       |
| `20261122000800_functions_onboarding.sql` | `onboard_hunter`, `update_hunter_profile`                                  |

Never edit `20261122000300_game_config.sql` by hand. Change
`src/game/game-config.json`, then run `npm run gen:sql`. A Vitest test parses
the generated file and fails if the two drift (ADR-4).

## Setting up the Supabase project

1. Create a project at [supabase.com](https://supabase.com/dashboard) — any
   region near you; note the database password somewhere safe.
2. **Project Settings → API**: copy the _Project URL_ and the _anon public_ key
   into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The
   `service_role` key must never leave the dashboard — it is not used anywhere
   in this project.
3. **Authentication → Sign In / Providers → Email**: leave _Email_ enabled and
   turn **Confirm email** off. This is a personal single-user app; with
   confirmation on, sign-up cannot sign you straight in and onboarding stalls.
4. **Authentication → URL Configuration**: set the Site URL to
   `http://localhost:5173` while developing, and add your Vercel URL later.
5. Apply the migrations (below), then come back for
   `npx supabase gen types typescript` in step 1.4.

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

Either paste each migration into the dashboard SQL editor in filename order, or
link the project and push:

```powershell
npx supabase link --project-ref your-project-ref
```

```powershell
npx supabase db push
```

`db push` writes to your hosted database. Review the SQL first — it is yours to
run, and nothing in this repo runs it for you.

## Verifying after you apply

All three scripts are plain SQL with no psql meta-commands, so each one can
equally be pasted whole into the Supabase dashboard SQL editor. With a local
stack running, psql is quicker:

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_proof.sql
```

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/smoke_game_rules.sql
```

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/game_date_parity.sql
```

- `rls_proof.sql` — hunter A cannot read or write hunter B, the ledger rejects
  client writes, anonymous callers get nothing. Prints `RLS PROOF PASSED`.
- `smoke_game_rules.sql` — the game rules end to end: rewards, undo, auto
  quests, daily caps, late one-time quests, sealed days, day close, report.
  Prints `SMOKE TEST PASSED`.
- `game_date_parity.sql` — **generated.** The same day-rollover vectors the
  TypeScript engine is tested against, so SQL and engine cannot disagree (C5).

All three run inside a transaction and end with `ROLLBACK`. They create
throwaway `auth.users` rows, so run them against a local or test database.

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
> `rls_proof.sql` checks every helper and will fail if one is left reachable.

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

| RPC                                                                           | What it does                                                                                                                                                                                                                                                                     | Raises                                                                                                                                                                            |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboard_hunter(name, timezone, kcal_min, kcal_max, protein_target_g)`        | Creates the hunter, the first diet-target version (C8) and the four default quests, then returns the snapshot.                                                                                                                                                                   | `ALREADY_ONBOARDED`, `INVALID_TIMEZONE`, `INVALID_KCAL_RANGE`                                                                                                                     |
| `update_hunter_profile(name, timezone, kcal_min, kcal_max, protein_target_g)` | Hunter Settings. Name and timezone apply at once; diet targets are versioned to take effect from the next game day (C4/C8).                                                                                                                                                      | `HUNTER_NOT_FOUND`, `INVALID_TIMEZONE`, `INVALID_KCAL_RANGE`                                                                                                                      |
| `complete_quest(quest_id, value)`                                             | Manual quests only. Validates the goal, writes the completion and its capped XP event in one transaction. A dated one-time quest can be completed late and scores on the completion day (G10).                                                                                   | `HUNTER_NOT_FOUND`, `QUEST_NOT_FOUND`, `QUEST_ARCHIVED`, `QUEST_IS_AUTO`, `QUEST_NOT_SCHEDULED_TODAY`, `QUEST_NOT_DUE_YET`, `ALREADY_COMPLETED`, `VALUE_REQUIRED`, `GOAL_NOT_MET` |
| `undo_completion(completion_id)`                                              | Same game day only. Marks the completion reversed and appends the negating event.                                                                                                                                                                                                | `COMPLETION_NOT_FOUND`, `SEALED_DAY`                                                                                                                                              |
| `log_food(name, kcal, protein_g)`                                             | Writes today's entry, then re-evaluates `auto_protein_min`.                                                                                                                                                                                                                      | `HUNTER_NOT_FOUND`                                                                                                                                                                |
| `delete_food(id)`                                                             | Removes a **today** entry and re-evaluates protein.                                                                                                                                                                                                                              | `ENTRY_NOT_FOUND`, `SEALED_DAY`                                                                                                                                                   |
| `log_workout(title, notes, sets)`                                             | Writes today's workout and its sets, then re-evaluates `auto_workout`. `sets` is a JSON array of `{exercise_name, reps, weight_kg}` in order.                                                                                                                                    | `HUNTER_NOT_FOUND`, `INVALID_SETS`                                                                                                                                                |
| `delete_workout(id)`                                                          | Removes a **today** workout (sets cascade) and re-evaluates.                                                                                                                                                                                                                     | `WORKOUT_NOT_FOUND`, `SEALED_DAY`                                                                                                                                                 |
| `allocate_points(stat, points)`                                               | Appends a permanent allocation. Availability is checked client-side by the engine (ADR-5).                                                                                                                                                                                       | `UNKNOWN_STAT_TAG`, `POINTS_MUST_BE_POSITIVE`, `HUNTER_NOT_FOUND`                                                                                                                 |
| `close_days()`                                                                | Closes every unclosed game day before today: settles the deferred calorie quest, tallies core quests, writes `daily_logs`, awards the daily clear, advances `last_closed_on`. Idempotent, locks the hunter row, closes at most 30 days per call and reports `more_pending` (G8). | `HUNTER_NOT_FOUND`                                                                                                                                                                |
| `acknowledge_report()`                                                        | Marks every unacknowledged closed day as seen (G9).                                                                                                                                                                                                                              | —                                                                                                                                                                                 |

### Day boundaries (C5, C7)

A game day starts at **03:00** wall-clock time in the hunter's timezone, so a
session that runs past midnight still belongs to the day it started. The hour
lives in `game_config.game_day_start_hour`, generated from the same JSON the
engine reads, and `game_date_at()` mirrors `gameDateAt()` in
`src/game/gameDate.ts` exactly.

`game_today()` is additionally clamped to `last_closed_on + 1`, so moving the
timezone west can never reopen a day that has already been sealed.

### The Penalty Zone hook

`close_days()` has a clearly marked no-op section between writing the day log
and advancing `last_closed_on`. Phase 2 inserts the penalty step there; nothing
above or below it needs rewriting (brief 6.4 step 5).
