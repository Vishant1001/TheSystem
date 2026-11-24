#!/usr/bin/env node
/**
 * ADR-4 / C2: src/game/game-config.json is the single source of truth for every
 * game number, and src/game/testdata/game-date-vectors.json for the day
 * rollover. Both SQL artifacts below are generated from those files:
 *
 *   supabase/migrations/20261123000100_game_config_v2.sql seed for game_config
 *
 * 20261122000300_game_config.sql is the Phase 1 seed. It is already applied
 * on the hosted project, so it is frozen history: migrations are forward-only,
 * and the newest config migration re-seeds every key with an upsert.
 *   supabase/tests/game_date_parity.sql                  engine/SQL parity (C5)
 *
 * Regenerate with:  npm run gen:sql
 * The drift guard lives in src/game/sqlArtifacts.test.ts, which parses these
 * files and compares them back to the JSON, so the two can never disagree.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CONFIG_MIGRATION_PATH = 'supabase/migrations/20261123000100_game_config_v2.sql';
/** Frozen: applied on hosted in Phase 1. Never regenerated. */
export const PHASE1_CONFIG_MIGRATION_PATH = 'supabase/migrations/20261122000300_game_config.sql';
export const PARITY_TEST_PATH = 'supabase/tests/game_date_parity.sql';
export const SCHEDULE_PARITY_TEST_PATH = 'supabase/tests/quest_schedule_parity.sql';
export const SAFE_ZONE_PARITY_TEST_PATH = 'supabase/tests/safe_zone_parity.sql';

const GENERATED_HEADER = [
  '-- GENERATED FILE - DO NOT EDIT BY HAND.',
  '-- Source: src/game/game-config.json (+ src/game/testdata/game-date-vectors.json)',
  '-- Regenerate: npm run gen:sql',
  '',
].join('\n');

/** Exactly the slice of the config the database needs (mirrors sqlConfigSlice). */
export function sqlConfigRows(config) {
  return [
    ['version', config.version],
    ['game_day_start_hour', config.dayRollover.startHour],
    ['quest_xp_by_difficulty', config.rewards.xpByDifficulty],
    ['daily_caps', config.dailyCaps],
    ['stat_xp_divisor', config.rewards.statXpDivisor],
    ['min_stat_xp_per_tag', config.rewards.minStatXpPerTag],
    ['free_points_per_daily_clear', config.freePoints.perDailyClear],
    ['close_days_max_backfill', config.dayClose.maxBackfillDays],
    ['level_curve', config.levels],
    ['stat_order', config.stats.ids],
    ['award_sources', config.awardSources],
    ['penalty', config.penalty],
    ['stones', config.stones],
    ['safe_zones', config.safeZones],
    ['gym', config.gym],
  ];
}

export function buildGameConfigMigration(config) {
  const values = sqlConfigRows(config)
    .map(([key, value]) => `  ('${key}', '${JSON.stringify(value).replaceAll("'", "''")}'::jsonb)`)
    .join(',\n');

  return `${GENERATED_HEADER}
-- Seed of public.game_config (ADR-4, amended in Phase 2). SQL owns awards and
-- caps; TypeScript is the reference for the curves, which SQL may read (the
-- level curve sizes XP Debt). Both read these same numbers.
--
-- Forward-only: this re-seeds every key with an upsert, so it supersedes the
-- Phase 1 seed (20261122000300_game_config.sql) without editing it.

insert into public.game_config (key, value)
values
${values}
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();
`;
}

export function buildGameDateParityTest(vectors, config) {
  const assertions = vectors
    .map((vector) => {
      const startHour = vector.startHour ?? config.dayRollover.startHour;
      return [
        `  -- ${vector.note}`,
        `  v_count := v_count + 1;`,
        `  v_actual := public.game_date_at(timestamptz '${vector.instant}', '${vector.timeZone}', ${startHour});`,
        `  if v_actual <> date '${vector.expected}' then`,
        `    raise exception 'game_date_at(%, %, %) returned %, expected %',`,
        `      '${vector.instant}', '${vector.timeZone}', ${startHour}, v_actual, date '${vector.expected}';`,
        `  end if;`,
      ].join('\n');
    })
    .join('\n\n');

  return `${GENERATED_HEADER}
-- C5 parity: these are the same vectors the TypeScript engine is tested against
-- in src/game/gameDate.test.ts. If SQL and the engine ever disagree about which
-- game day an instant belongs to, one of these two suites fails.
--
-- Run against a database that already has the migrations applied:
--   psql "$DATABASE_URL" -f supabase/tests/game_date_parity.sql

do $$
declare
  v_actual date;
  v_count integer := 0;
begin
${assertions}

  raise notice 'game_date parity: % vectors passed', v_count;
end;
$$;
`;
}

function sqlLiteral(value) {
  return value === null ? 'null' : `'${String(value)}'`;
}

function smallintArray(days) {
  if (days === null) return 'null';
  return `array[${days.join(', ')}]::smallint[]`;
}

export function buildQuestScheduleParityTest(vectors) {
  const assertions = vectors
    .map((vector) => {
      const { quest, timezone, day, isDone, expected, note } = vector;
      return [
        `  -- ${note}`,
        `  v_count := v_count + 1;`,
        `  v_actual := public.quest_scheduled_on(`,
        `    '${quest.type}', ${smallintArray(quest.scheduleDays)}, ${quest.dueOn === null ? 'null' : `date '${quest.dueOn}'`},`,
        `    ${quest.createdAt === null ? 'null' : `timestamptz '${quest.createdAt}'`},`,
        `    ${quest.archivedAt === null ? 'null' : `timestamptz '${quest.archivedAt}'`},`,
        `    date '${day}', ${sqlLiteral(timezone)});`,
        `  if v_actual is distinct from ${String(expected.scheduled)} then`,
        `    raise exception 'quest_scheduled_on mismatch (%): got %, expected %',`,
        `      ${sqlLiteral(note)}, v_actual, ${String(expected.scheduled)};`,
        `  end if;`,
        ``,
        `  v_actual := public.quest_overdue_on(`,
        `    '${quest.type}', ${quest.dueOn === null ? 'null' : `date '${quest.dueOn}'`}, date '${day}', ${String(isDone)});`,
        `  if v_actual is distinct from ${String(expected.overdue)} then`,
        `    raise exception 'quest_overdue_on mismatch (%): got %, expected %',`,
        `      ${sqlLiteral(note)}, v_actual, ${String(expected.overdue)};`,
        `  end if;`,
      ].join('\n');
    })
    .join('\n\n');

  return `${GENERATED_HEADER}
-- Quest scheduling parity: the same vectors drive src/game/schedule.test.ts and
-- this file, so the predicate the client renders from and the one close_days()
-- tallies with cannot drift. Expected values are written by hand in the JSON,
-- not taken from either implementation.
--
--   psql "$DATABASE_URL" -f supabase/tests/quest_schedule_parity.sql

do $$
declare
  v_actual boolean;
  v_count integer := 0;
begin
${assertions}

  raise notice 'quest schedule parity: % vectors passed', v_count;
end;
$$;
`;
}

function dateArray(values) {
  if (values.length === 0) return "'{}'::date[]";
  const items = values.map((value) => (value === null ? 'null' : `date '${value}'`));
  return `array[${items.join(', ')}]::date[]`;
}

function smallintList(values) {
  return values.length === 0 ? "'{}'::smallint[]" : `array[${values.join(', ')}]::smallint[]`;
}

const STREAK_EFFECTS = { E: 'extend', R: 'reset', N: 'neutral' };
const STREAK_MODES = { L: 'lenient', S: 'standard', H: 'hardcore' };

function buildDayOutcomeAssertion(vector) {
  const quests = vector.quests
    .map((q) => `(${q.isCore}, ${q.onRestDays}, ${q.scheduled}, ${q.done})`)
    .join(', ');
  const { expected } = vector;
  const tally = 'public.counts_toward_core_tally(q.is_core, q.on_rest, q.scheduled, v_rest)';
  return [
    `  -- ${vector.note}`,
    `  v_count := v_count + 1;`,
    `  v_rest := ${vector.phase2Rules}`,
    `    and extract(isodow from date '${vector.day}')::smallint = any (${smallintList(vector.restDays)});`,
    `  select count(*) filter (where ${tally}),`,
    `         count(*) filter (where q.done and ${tally})`,
    `    into v_total, v_done`,
    `    from (values ${quests}) as q(is_core, on_rest, scheduled, done);`,
    `  select * into v_outcome`,
    `    from public.day_outcome(${vector.phase2Rules}, v_rest, ${vector.safe}, v_total, v_done);`,
    `  if v_outcome.status is distinct from '${expected.status}'`,
    `     or v_total <> ${expected.coreTotal} or v_done <> ${expected.coreDone}`,
    `     or v_outcome.free_points <> ${expected.freePoints}`,
    `     or v_outcome.creates_penalty is distinct from ${expected.createsPenalty}`,
    `     or v_outcome.streak_effect is distinct from '${expected.streak}' then`,
    `    raise exception 'day_outcome mismatch (%): got % (% of %)',`,
    `      ${sqlLiteral(vector.note)}, v_outcome, v_done, v_total;`,
    `  end if;`,
  ].join('\n');
}

function buildStreakAssertion(vector) {
  const effects = [...vector.effects].map((letter) => `'${STREAK_EFFECTS[letter]}'`);
  const modes = [...vector.modes].map((letter) => `'${STREAK_MODES[letter]}'`);
  const spent = Array.from(vector.effects, (_, index) => vector.spentAfter[String(index + 1)] ?? 0);
  const stoneDays = vector.expected.stoneDays;
  return [
    `  -- ${vector.note}`,
    `  v_count := v_count + 1;`,
    `  v_streak := 0;`,
    `  v_held := 0;`,
    `  v_stone_days := '{}';`,
    `  v_effects := array[${effects.join(', ')}];`,
    `  v_modes := array[${modes.join(', ')}];`,
    `  v_spent := array[${spent.join(', ')}];`,
    `  for v_i in 1 .. cardinality(v_effects) loop`,
    `    v_next := public.next_streak(v_streak, v_effects[v_i]);`,
    `    if public.earns_stone(v_streak, v_next, v_held, v_modes[v_i]) then`,
    `      v_held := v_held + 1;`,
    `      v_stone_days := v_stone_days || v_i;`,
    `    end if;`,
    `    v_streak := v_next;`,
    `    v_held := v_held - v_spent[v_i];`,
    `  end loop;`,
    `  if v_streak <> ${vector.expected.finalStreak} or v_held <> ${vector.expected.finalHeld}`,
    `     or v_stone_days <> ${stoneDays.length === 0 ? "'{}'::integer[]" : `array[${stoneDays.join(', ')}]::integer[]`} then`,
    `    raise exception 'streak mismatch (%): streak %, held %, stone days %',`,
    `      ${sqlLiteral(vector.note)}, v_streak, v_held, v_stone_days;`,
    `  end if;`,
  ].join('\n');
}

function buildSafeStartAssertion(vector) {
  return [
    `  -- ${vector.note}`,
    `  v_count := v_count + 1;`,
    `  v_date := public.safe_period_start(timestamptz '${vector.now}', '${vector.timeZone}', '${vector.mode}');`,
    `  if v_date <> date '${vector.expected}' then`,
    `    raise exception 'safe_period_start mismatch (%): got %', ${sqlLiteral(vector.note)}, v_date;`,
    `  end if;`,
  ].join('\n');
}

function buildSafeQuotaAssertion(vector) {
  const starts = dateArray(vector.existing.map((period) => period.startOn));
  const ends = dateArray(vector.existing.map((period) => period.endOn));
  const ended = dateArray(vector.existing.map((period) => period.endedEarlyOn));
  const expected = vector.expected === null ? 'null' : `'${vector.expected}'`;
  return [
    `  -- ${vector.note}`,
    `  v_count := v_count + 1;`,
    `  v_refusal := public.safe_period_refusal(`,
    `    ${starts}, ${ends}, ${ended}, date '${vector.startOn}', ${vector.days});`,
    `  if v_refusal is distinct from ${expected} then`,
    `    raise exception 'safe_period_refusal mismatch (%): got %', ${sqlLiteral(vector.note)}, v_refusal;`,
    `  end if;`,
  ].join('\n');
}

/**
 * Safe Zone parity (Step 2.2): day outcome, streak and stones, safe period
 * start and quota. The same JSON drives dayStatus.test.ts and safeZones.test.ts.
 */
export function buildSafeZoneParityTest({ dayVectors, streakVectors, safeVectors }) {
  const day = dayVectors.map(buildDayOutcomeAssertion).join('\n\n');
  const streak = streakVectors.map(buildStreakAssertion).join('\n\n');
  const start = safeVectors.start.map(buildSafeStartAssertion).join('\n\n');
  const quota = safeVectors.quota.map(buildSafeQuotaAssertion).join('\n\n');

  return `${GENERATED_HEADER}
-- Safe Zone parity (Phase 2, Step 2.2). Generated from
--   src/game/testdata/day-status-vectors.json  -> day_outcome, counts_toward_core_tally
--   src/game/testdata/streak-vectors.json      -> next_streak, earns_stone
--   src/game/testdata/safe-zone-vectors.json   -> safe_period_start, safe_period_refusal
-- The same files drive dayStatus.test.ts and safeZones.test.ts.

do $$
declare
  v_count integer := 0;
  v_rest boolean;
  v_total integer;
  v_done integer;
  v_outcome record;
begin
${day}

  raise notice 'day outcome parity: % vectors passed', v_count;
end;
$$;

do $$
declare
  v_count integer := 0;
  v_streak integer;
  v_next integer;
  v_held integer;
  v_i integer;
  v_effects text[];
  v_modes text[];
  v_spent integer[];
  v_stone_days integer[];
begin
${streak}

  raise notice 'streak and stone parity: % vectors passed', v_count;
end;
$$;

do $$
declare
  v_count integer := 0;
  v_date date;
  v_refusal text;
begin
${start}

${quota}

  raise notice 'safe period parity: % vectors passed', v_count;
end;
$$;
`;
}

export const PENALTY_PARITY_TEST_PATH = 'supabase/tests/penalty_parity.sql';

function textArray(values) {
  return values.length === 0
    ? "'{}'::text[]"
    : `array[${values.map((value) => `'${value}'`).join(', ')}]::text[]`;
}

function sqlNullable(value) {
  return value === null || value === undefined ? 'null' : `'${value}'`;
}

/**
 * Penalty Zone parity (Step 2.3): level curve, debt, penalty rules and the
 * award pipeline. The same JSON drives levelCurveParity.test.ts,
 * penalty.test.ts and award.test.ts.
 */
export function buildPenaltyParityTest({ curve, debt, penalty, award }) {
  const amounts = debt.amount
    .map((vector) =>
      [
        `  -- ${vector.note}`,
        `  v_count := v_count + 1;`,
        `  if public.debt_amount(${vector.ratePercent}, ${vector.level}) <> ${vector.expected} then`,
        `    raise exception 'debt_amount mismatch (%): got %', ${sqlLiteral(vector.note)},`,
        `      public.debt_amount(${vector.ratePercent}, ${vector.level});`,
        `  end if;`,
      ].join('\n'),
    )
    .join('\n\n');

  const repayments = debt.repayment
    .map((vector) =>
      [
        `  -- ${vector.note}`,
        `  v_count := v_count + 1;`,
        `  if public.debt_repayment(${vector.awardXp}, ${vector.remaining}) <> ${vector.expected} then`,
        `    raise exception 'debt_repayment mismatch (%)', ${sqlLiteral(vector.note)};`,
        `  end if;`,
      ].join('\n'),
    )
    .join('\n\n');

  const categories = penalty.trialCategory
    .map((vector) =>
      [
        `  -- ${vector.note}`,
        `  v_count := v_count + 1;`,
        `  v_text := public.trial_category(${textArray(vector.missed)});`,
        `  if v_text is distinct from '${vector.expected}' then`,
        `    raise exception 'trial_category mismatch (%): got %', ${sqlLiteral(vector.note)}, v_text;`,
        `  end if;`,
      ].join('\n'),
    )
    .join('\n\n');

  const stats = penalty.weakenedStat
    .map((vector) =>
      [
        `  -- ${vector.note}`,
        `  v_count := v_count + 1;`,
        `  v_text := public.weakened_stat_for(${textArray(vector.tags.flat())});`,
        `  if v_text is distinct from '${vector.expected}' then`,
        `    raise exception 'weakened_stat_for mismatch (%): got %', ${sqlLiteral(vector.note)}, v_text;`,
        `  end if;`,
      ].join('\n'),
    )
    .join('\n\n');

  const failedDays = penalty.failedDay
    .map((vector) => {
      const open = vector.open;
      const { expected } = vector;
      return [
        `  -- ${vector.note}`,
        `  v_count := v_count + 1;`,
        `  select * into v_action from public.failed_day_action(`,
        `    ${sqlNullable(open?.state)}, ${open ? String(open.escalated) : 'null'}, '${vector.mode}');`,
        `  if v_action.action is distinct from '${expected.action}'`,
        `     or v_action.state is distinct from ${sqlNullable(expected.state)}`,
        `     or v_action.debt_rate_percent is distinct from ${expected.debtRatePercent ?? 'null'} then`,
        `    raise exception 'failed_day_action mismatch (%): got %', ${sqlLiteral(vector.note)}, v_action;`,
        `  end if;`,
      ].join('\n');
    })
    .join('\n\n');

  const states = [
    'pending_choice',
    'trial_active',
    'debt_active',
    'weakened_active',
    'cleared',
    'redeemed',
  ];
  const allowed = new Set(penalty.transitions.allowed);
  const transitions = states
    .flatMap((from) => states.map((to) => [from, to]))
    .map(([from, to]) => {
      const expected = allowed.has(`${from}>${to}`);
      const extra =
        `${from}>${to}` === penalty.transitions.reopenNeedsDebt
          ? [
              `  if public.penalty_transition_allowed('${from}', '${to}', 'trial') then`,
              `    raise exception 'a cleared trial must never reopen';`,
              `  end if;`,
            ]
          : [];
      return [
        `  v_count := v_count + 1;`,
        `  if public.penalty_transition_allowed('${from}', '${to}', 'debt') is distinct from ${expected} then`,
        `    raise exception 'transition % -> % should be ${expected ? 'allowed' : 'refused'}', '${from}', '${to}';`,
        `  end if;`,
        ...extra,
      ].join('\n');
    })
    .join('\n');

  const awards = award
    .map((vector) => {
      const { input, expected } = vector;
      const statXp = { STR: 0, AGI: 0, VIT: 0, INT: 0, SENSE: 0, ...expected.statXp };
      return [
        `  -- ${vector.note}`,
        `  v_count := v_count + 1;`,
        `  select * into v_award from public.compute_award(`,
        `    '${input.source}', ${input.fullXp}, ${input.capRoom}, '${JSON.stringify(input.stats)}'::jsonb,`,
        `    ${sqlNullable(input.weakenedStat)}, ${input.debtRemaining});`,
        `  if v_award.xp <> ${expected.xp} or v_award.capped is distinct from ${expected.capped}`,
        `     or v_award.stat_xp <> '${JSON.stringify(statXp)}'::jsonb`,
        `     or v_award.weakened is distinct from ${expected.weakened}`,
        `     or v_award.repayment <> ${expected.repayment} then`,
        `    raise exception 'compute_award mismatch (%): got %', ${sqlLiteral(vector.note)}, v_award;`,
        `  end if;`,
      ].join('\n');
    })
    .join('\n\n');

  return `${GENERATED_HEADER}
-- Penalty Zone parity (Phase 2, Step 2.3). Generated from
--   src/game/testdata/level-curve-vectors.json -> xp_to_next (every level)
--   src/game/testdata/debt-vectors.json        -> debt_amount, debt_repayment
--   src/game/testdata/penalty-vectors.json     -> trial_category, weakened_stat_for,
--                                                 failed_day_action, penalty_transition_allowed
--   src/game/testdata/award-vectors.json       -> compute_award
-- The same files drive the engine tests in src/game.

do $$
declare
  v_expected integer[] := array[${curve.xpToNext.join(', ')}];
  v_level integer;
  v_actual integer;
begin
  for v_level in ${curve.startLevel} .. ${curve.startLevel} + cardinality(v_expected) - 1 loop
    v_actual := public.xp_to_next(v_level);
    if v_actual <> v_expected[v_level - ${curve.startLevel} + 1] then
      raise exception 'xp_to_next(%) = %, expected %', v_level, v_actual,
        v_expected[v_level - ${curve.startLevel} + 1];
    end if;
  end loop;
  raise notice 'level curve parity: % levels passed', cardinality(v_expected);
end;
$$;

do $$
declare
  v_count integer := 0;
  v_text text;
  v_action record;
begin
${amounts}

${repayments}

${categories}

${stats}

${failedDays}

${transitions}

  raise notice 'debt and penalty rule parity: % vectors passed', v_count;
end;
$$;

do $$
declare
  v_count integer := 0;
  v_award record;
begin
${awards}

  raise notice 'award pipeline parity: % vectors passed', v_count;
end;
$$;
`;
}

export const EXERCISE_LIBRARY_MIGRATION_PATH =
  'supabase/migrations/20261125000200_exercise_library.sql';
export const GYM_PARITY_TEST_PATH = 'supabase/tests/gym_parity.sql';

function quote(value) {
  return value === null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
}

function textList(values) {
  return values.length === 0 ? "'{}'::text[]" : `array[${values.map(quote).join(', ')}]::text[]`;
}

/**
 * Seed of the global exercise library (brief 4.1) from the committed,
 * trimmed free-exercise-db snapshot. The XP kind comes from the config's
 * category mapping; an unknown category stops the generator.
 */
export function buildExerciseLibraryMigration(library, config) {
  const kinds = config.gym.libraryCategoryKinds;
  const rows = library.exercises.map((exercise) => {
    const kind = kinds[exercise.category];
    if (kind === undefined) {
      throw new Error(`no XP kind for library category "${exercise.category}" (${exercise.id})`);
    }
    return `  (${[
      quote(exercise.id),
      quote(exercise.name),
      quote(exercise.category),
      quote(kind),
      quote(exercise.equipment),
      textList(exercise.primaryMuscles),
      textList(exercise.secondaryMuscles),
      quote(exercise.mechanic),
      quote(exercise.force),
    ].join(', ')})`;
  });

  return `-- GENERATED FILE - DO NOT EDIT BY HAND.
-- Source: supabase/data/exercise-library.json (+ src/game/game-config.json for kinds)
-- Regenerate: npm run gen:sql
--
-- The global exercise library (brief 4.1): ${library.exercises.length} exercises from
-- ${library.source.repository}
-- at commit ${library.source.commit} (${library.source.license}).
-- Trimmed to: ${library.source.trimmed}. No images, no runtime fetching.
--
-- Library rows have no owner (user_id null) and are keyed by their source id,
-- so re-running updates names and metadata in place. The kind is immutable
-- once seeded.

insert into public.exercises (
  source_id, name, category, kind, equipment, primary_muscles, secondary_muscles, mechanic, force
)
values
${rows.join(',\n')}
on conflict (source_id) where user_id is null do update
  set name = excluded.name,
      category = excluded.category,
      equipment = excluded.equipment,
      primary_muscles = excluded.primary_muscles,
      secondary_muscles = excluded.secondary_muscles,
      mechanic = excluded.mechanic,
      force = excluded.force;
`;
}

/** Gym parity (2.5: e1RM; 2.6 adds PR detection, set XP and bosses). */
const SET_TYPE_LETTERS = { w: 'warmup', s: 'working' };
const KIND_LETTERS = { S: 'strength', C: 'cardio', M: 'mobility' };

function jsonLiteral(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

/** The engine's PR detection result in the SQL reply's snake_case shape. */
function sqlPrDetection(expected) {
  return {
    records: expected.records.map((record) => ({
      pr_kind: record.prKind,
      value_centi: record.valueCentiKg,
      set_index: record.setIndex,
      baseline: record.baseline,
    })),
    bonus_set_indexes: expected.bonusSetIndexes,
  };
}

function sqlLoggedSets(sets) {
  return sets.map((set) => ({ set_type: set.setType, reps: set.reps, weight_kg: set.weightKg }));
}

/**
 * Gym parity (Steps 2.5-2.6): e1RM, PR detection, the daily PR bonus limit,
 * set XP and boss defeats. The same JSON drives gym.test.ts.
 */
export function buildGymParityTest({ gym }) {
  const block = (lines) => lines.join('\n');
  const e1rm = gym.e1rm.map((vector) =>
    block([
      `  -- ${vector.note}`,
      `  v_count := v_count + 1;`,
      `  v_actual := public.e1rm_centi(${vector.weightCentiKg}, ${vector.reps});`,
      `  if v_actual is distinct from ${vector.expected === null ? 'null' : vector.expected} then`,
      `    raise exception 'e1rm_centi mismatch (%): got %', ${sqlLiteral(vector.note)}, v_actual;`,
      `  end if;`,
    ]),
  );
  const prs = gym.prs.map((vector) =>
    block([
      `  -- ${vector.note}`,
      `  v_count := v_count + 1;`,
      `  v_json := public.detect_prs(${sqlLiteral(vector.kind)}, ${vector.prior.e1rm ?? 'null'}, ${vector.prior.maxWeight ?? 'null'},`,
      `    ${jsonLiteral(sqlLoggedSets(vector.sets))});`,
      `  if v_json is distinct from ${jsonLiteral(sqlPrDetection(vector.expected))} then`,
      `    raise exception 'detect_prs mismatch (%): got %', ${sqlLiteral(vector.note)}, v_json;`,
      `  end if;`,
    ]),
  );
  const payable = gym.payableBonuses.map((vector) =>
    block([
      `  v_count := v_count + 1;`,
      `  v_actual := public.payable_pr_bonuses(${vector.candidates}, ${vector.alreadyPaidToday});`,
      `  if v_actual is distinct from ${vector.expected} then`,
      `    raise exception 'payable_pr_bonuses(${vector.candidates}, ${vector.alreadyPaidToday}) mismatch: got %', v_actual;`,
      `  end if;`,
    ]),
  );
  const setXp = gym.setXp.map((vector) => {
    const sets = vector.sets
      .split(' ')
      .map((token) => ({ kind: KIND_LETTERS[token[1]], set_type: SET_TYPE_LETTERS[token[0]] }));
    return block([
      `  -- ${vector.note}`,
      `  v_count := v_count + 1;`,
      `  select * into v_set_xp from public.workout_set_xp(${jsonLiteral(sets)}, ${vector.countedToday});`,
      `  if v_set_xp.counted_sets is distinct from ${vector.expected.countedSets}`,
      `     or v_set_xp.full_xp is distinct from ${vector.expected.fullXp}`,
      `     or v_set_xp.stats is distinct from ${jsonLiteral(vector.expected.stats)} then`,
      `    raise exception 'workout_set_xp mismatch (%): got %', ${sqlLiteral(vector.note)}, v_set_xp;`,
      `  end if;`,
    ]);
  });
  const bosses = gym.bosses.map((vector) =>
    block([
      `  -- ${vector.note}`,
      `  v_count := v_count + 1;`,
      `  if public.defeats_boss(${sqlLiteral(vector.boss.kind)}, ${vector.boss.targetWeightKg}, ${vector.boss.targetReps},`,
      `       ${sqlLiteral(vector.set.setType)}, ${vector.set.reps ?? 'null'}, ${vector.set.weightKg ?? 'null'})`,
      `     is distinct from ${vector.expected} then`,
      `    raise exception 'defeats_boss mismatch (%)', ${sqlLiteral(vector.note)};`,
      `  end if;`,
    ]),
  );

  const section = (title, items, label) => `  -- ${title}
  v_count := 0;
${items.join('\n\n')}
  raise notice '${label}: % vectors passed', v_count;`;

  return `${GENERATED_HEADER}
-- Gym parity. Generated from src/game/testdata/gym-vectors.json, the same
-- file gym.test.ts runs against the engine.

do $$
declare
  v_count integer := 0;
  v_actual integer;
  v_json jsonb;
  v_set_xp record;
begin
${section('e1RM (Epley, centi-kg, half up)', e1rm, 'e1RM parity')}

${section('PR detection', prs, 'PR detection parity')}

${section('PR bonuses payable today (max per game day)', payable, 'PR bonus limit parity')}

${section('Set XP', setXp, 'set XP parity')}

${section('Boss defeats', bosses, 'boss parity')}
end;
$$;
`;
}

function main() {
  const config = JSON.parse(readFileSync(join(root, 'src/game/game-config.json'), 'utf8'));
  const vectors = JSON.parse(
    readFileSync(join(root, 'src/game/testdata/game-date-vectors.json'), 'utf8'),
  );

  const scheduleVectors = JSON.parse(
    readFileSync(join(root, 'src/game/testdata/schedule-vectors.json'), 'utf8'),
  );

  const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
  const safeZoneInputs = {
    dayVectors: readJson('src/game/testdata/day-status-vectors.json'),
    streakVectors: readJson('src/game/testdata/streak-vectors.json'),
    safeVectors: readJson('src/game/testdata/safe-zone-vectors.json'),
  };
  writeFileSync(
    join(root, SAFE_ZONE_PARITY_TEST_PATH),
    buildSafeZoneParityTest(safeZoneInputs),
    'utf8',
  );
  console.log(`wrote ${SAFE_ZONE_PARITY_TEST_PATH}`);

  writeFileSync(
    join(root, PENALTY_PARITY_TEST_PATH),
    buildPenaltyParityTest({
      curve: readJson('src/game/testdata/level-curve-vectors.json'),
      debt: readJson('src/game/testdata/debt-vectors.json'),
      penalty: readJson('src/game/testdata/penalty-vectors.json'),
      award: readJson('src/game/testdata/award-vectors.json'),
    }),
    'utf8',
  );
  console.log(`wrote ${PENALTY_PARITY_TEST_PATH}`);

  writeFileSync(
    join(root, EXERCISE_LIBRARY_MIGRATION_PATH),
    buildExerciseLibraryMigration(readJson('supabase/data/exercise-library.json'), config),
    'utf8',
  );
  console.log(`wrote ${EXERCISE_LIBRARY_MIGRATION_PATH}`);

  writeFileSync(
    join(root, GYM_PARITY_TEST_PATH),
    buildGymParityTest({ gym: readJson('src/game/testdata/gym-vectors.json') }),
    'utf8',
  );
  console.log(`wrote ${GYM_PARITY_TEST_PATH}`);

  writeFileSync(join(root, CONFIG_MIGRATION_PATH), buildGameConfigMigration(config), 'utf8');
  writeFileSync(join(root, PARITY_TEST_PATH), buildGameDateParityTest(vectors, config), 'utf8');
  writeFileSync(
    join(root, SCHEDULE_PARITY_TEST_PATH),
    buildQuestScheduleParityTest(scheduleVectors),
    'utf8',
  );

  console.log(`wrote ${CONFIG_MIGRATION_PATH}`);
  console.log(`wrote ${PARITY_TEST_PATH} (${vectors.length} vectors)`);
  console.log(`wrote ${SCHEDULE_PARITY_TEST_PATH} (${scheduleVectors.length} vectors)`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
