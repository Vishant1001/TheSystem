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
