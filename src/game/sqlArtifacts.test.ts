import { describe, expect, it } from 'vitest';
import { GAME_CONFIG, sqlConfigSlice } from './config';
import vectors from './testdata/game-date-vectors.json';
import scheduleVectors from './testdata/schedule-vectors.json';
import configMigration from '../../supabase/migrations/20261123000100_game_config_v2.sql?raw';
import phase1ConfigMigration from '../../supabase/migrations/20261122000300_game_config.sql?raw';
import parityTest from '../../supabase/tests/game_date_parity.sql?raw';
import scheduleParityTest from '../../supabase/tests/quest_schedule_parity.sql?raw';

/**
 * ADR-4 / C2 drift guard.
 *
 * game-config.json is the single source of truth. The SQL seed and the SQL
 * parity test are generated from it by scripts/gen-sql-artifacts.mjs. This test
 * parses those generated files and compares them back to the JSON, so editing
 * one without regenerating the other fails the suite.
 */
function parseSeededConfig(sql: string): Record<string, unknown> {
  const rows: Record<string, unknown> = {};
  for (const match of sql.matchAll(/\('([a-z_]+)', '(.+?)'::jsonb\)/g)) {
    const key = match[1];
    const value = match[2];
    if (key === undefined || value === undefined) continue;
    rows[key] = JSON.parse(value);
  }
  return rows;
}

describe('generated game_config migration', () => {
  it('is marked as generated so nobody edits it by hand', () => {
    expect(configMigration).toContain('GENERATED FILE - DO NOT EDIT BY HAND');
    expect(configMigration).toContain('npm run gen:sql');
  });

  it('seeds exactly the values the engine holds (ADR-4)', () => {
    expect(parseSeededConfig(configMigration)).toEqual(sqlConfigSlice());
  });

  it('upserts, so re-running the migration is safe', () => {
    expect(configMigration).toContain('on conflict (key) do update');
  });

  it('re-seeds every key of the frozen Phase 1 seed, so the newest value wins', () => {
    // The Phase 1 seed is applied on hosted and never edited (forward-only).
    const phase1 = parseSeededConfig(phase1ConfigMigration);
    const latest = parseSeededConfig(configMigration);
    expect(Object.keys(phase1).length).toBeGreaterThan(0);
    for (const key of Object.keys(phase1)) expect(latest).toHaveProperty(key);
  });
});

describe('generated game date parity test', () => {
  it('covers every vector the engine is tested against (C5)', () => {
    const assertions = [...parityTest.matchAll(/public\.game_date_at\(/g)];
    expect(assertions).toHaveLength(vectors.length);
  });

  it('asserts the same instants and expected dates as the engine suite', () => {
    for (const vector of vectors) {
      const startHour = vector.startHour ?? GAME_CONFIG.dayRollover.startHour;
      expect(parityTest).toContain(
        `public.game_date_at(timestamptz '${vector.instant}', '${vector.timeZone}', ${startHour})`,
      );
      expect(parityTest).toContain(`date '${vector.expected}'`);
    }
  });
});

describe('generated quest schedule parity test', () => {
  it('is marked as generated', () => {
    expect(scheduleParityTest).toContain('GENERATED FILE - DO NOT EDIT BY HAND');
  });

  it('asserts both predicates for every shared vector', () => {
    const scheduled = [...scheduleParityTest.matchAll(/public\.quest_scheduled_on\(/g)];
    const overdue = [...scheduleParityTest.matchAll(/public\.quest_overdue_on\(/g)];
    expect(scheduled).toHaveLength(scheduleVectors.length);
    expect(overdue).toHaveLength(scheduleVectors.length);
  });

  it('carries the hand-written expectations, not whatever the code returns', () => {
    for (const vector of scheduleVectors) {
      expect(scheduleParityTest).toContain(`-- ${vector.note}`);
      expect(scheduleParityTest).toContain(`date '${vector.day}'`);
    }
    // Both outcomes must appear, or the SQL side could pass by always
    // returning one value.
    expect(scheduleParityTest).toContain('is distinct from true');
    expect(scheduleParityTest).toContain('is distinct from false');
  });
});
