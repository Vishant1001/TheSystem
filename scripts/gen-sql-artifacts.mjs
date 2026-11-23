#!/usr/bin/env node
/**
 * ADR-4 / C2: src/game/game-config.json is the single source of truth for every
 * game number, and src/game/testdata/game-date-vectors.json for the day
 * rollover. Both SQL artifacts below are generated from those files:
 *
 *   supabase/migrations/20261122000300_game_config.sql   seed for game_config
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

export const CONFIG_MIGRATION_PATH = 'supabase/migrations/20261122000300_game_config.sql';
export const PARITY_TEST_PATH = 'supabase/tests/game_date_parity.sql';
export const SCHEDULE_PARITY_TEST_PATH = 'supabase/tests/quest_schedule_parity.sql';

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
  ];
}

export function buildGameConfigMigration(config) {
  const values = sqlConfigRows(config)
    .map(([key, value]) => `  ('${key}', '${JSON.stringify(value)}'::jsonb)`)
    .join(',\n');

  return `${GENERATED_HEADER}
-- Seed of public.game_config (ADR-4). SQL owns awards and caps; the TypeScript
-- engine owns the curves. Both read these same numbers.

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

function main() {
  const config = JSON.parse(readFileSync(join(root, 'src/game/game-config.json'), 'utf8'));
  const vectors = JSON.parse(
    readFileSync(join(root, 'src/game/testdata/game-date-vectors.json'), 'utf8'),
  );

  const scheduleVectors = JSON.parse(
    readFileSync(join(root, 'src/game/testdata/schedule-vectors.json'), 'utf8'),
  );

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
