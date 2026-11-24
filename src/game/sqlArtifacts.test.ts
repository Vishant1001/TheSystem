import { describe, expect, it } from 'vitest';
import { GAME_CONFIG, sqlConfigSlice } from './config';
import vectors from './testdata/game-date-vectors.json';
import scheduleVectors from './testdata/schedule-vectors.json';
import configMigration from '../../supabase/migrations/20261123000100_game_config_v2.sql?raw';
import phase1ConfigMigration from '../../supabase/migrations/20261122000300_game_config.sql?raw';
import parityTest from '../../supabase/tests/game_date_parity.sql?raw';
import scheduleParityTest from '../../supabase/tests/quest_schedule_parity.sql?raw';
import safeZoneParityTest from '../../supabase/tests/safe_zone_parity.sql?raw';
import dayStatusVectors from './testdata/day-status-vectors.json';
import streakVectors from './testdata/streak-vectors.json';
import safeZoneVectors from './testdata/safe-zone-vectors.json';
import penaltyParityTest from '../../supabase/tests/penalty_parity.sql?raw';
import levelCurveVectors from './testdata/level-curve-vectors.json';
import debtVectors from './testdata/debt-vectors.json';
import penaltyVectors from './testdata/penalty-vectors.json';
import awardVectors from './testdata/award-vectors.json';
import gymVectors from './testdata/gym-vectors.json';
import exerciseLibrary from '../../supabase/data/exercise-library.json';
import exerciseLibraryMigration from '../../supabase/migrations/20261125000200_exercise_library.sql?raw';
import gymParityTest from '../../supabase/tests/gym_parity.sql?raw';

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

describe('generated safe zone parity test (Step 2.2)', () => {
  it('is marked as generated', () => {
    expect(safeZoneParityTest).toContain('GENERATED FILE - DO NOT EDIT BY HAND');
  });

  it('asserts every day outcome, streak and safe period vector', () => {
    expect([...safeZoneParityTest.matchAll(/from public\.day_outcome\(/g)]).toHaveLength(
      dayStatusVectors.length,
    );
    expect([...safeZoneParityTest.matchAll(/v_effects := array\[/g)]).toHaveLength(
      streakVectors.length,
    );
    expect([...safeZoneParityTest.matchAll(/public\.safe_period_start\(/g)]).toHaveLength(
      safeZoneVectors.start.length,
    );
    expect([...safeZoneParityTest.matchAll(/public\.safe_period_refusal\(/g)]).toHaveLength(
      safeZoneVectors.quota.length,
    );
  });

  it('carries the hand-written notes', () => {
    for (const vector of [...dayStatusVectors, ...streakVectors, ...safeZoneVectors.quota]) {
      expect(safeZoneParityTest).toContain(`-- ${vector.note}`);
    }
  });
});

describe('generated penalty parity test (Step 2.3)', () => {
  it('is marked as generated', () => {
    expect(penaltyParityTest).toContain('GENERATED FILE - DO NOT EDIT BY HAND');
  });

  it('pins every level of the curve', () => {
    expect(penaltyParityTest).toContain(`array[${levelCurveVectors.xpToNext.join(', ')}]`);
  });

  it('asserts every debt, penalty rule and award vector', () => {
    const count = (pattern: RegExp) => [...penaltyParityTest.matchAll(pattern)].length;
    expect(count(/if public\.debt_amount\(/g)).toBe(debtVectors.amount.length);
    expect(count(/if public\.debt_repayment\(/g)).toBe(debtVectors.repayment.length);
    expect(count(/public\.trial_category\(array/g)).toBe(penaltyVectors.trialCategory.length);
    expect(count(/public\.weakened_stat_for\(array/g)).toBe(penaltyVectors.weakenedStat.length);
    expect(count(/from public\.failed_day_action\(/g)).toBe(penaltyVectors.failedDay.length);
    expect(count(/if public\.penalty_transition_allowed\('[a-z_]+', '[a-z_]+', 'debt'\)/g)).toBe(
      36,
    );
    expect(count(/from public\.compute_award\(/g)).toBe(awardVectors.length);
  });
});

describe('generated exercise library seed (Step 2.5)', () => {
  // One VALUES row per line; a row may end in a quoted value or in null.
  const rows = [...exerciseLibraryMigration.matchAll(/^ {2}\('.*\),?\r?$/gm)].map(
    (match) => match[0],
  );

  it('is marked as generated and records its pinned source', () => {
    expect(exerciseLibraryMigration).toContain('GENERATED FILE - DO NOT EDIT BY HAND');
    expect(exerciseLibraryMigration).toContain(exerciseLibrary.source.commit);
    expect(exerciseLibraryMigration).toContain('Unlicense');
  });

  it('seeds every exercise in the snapshot, once', () => {
    expect(rows).toHaveLength(exerciseLibrary.exercises.length);
  });

  it('gives each exercise the kind the config maps its category to', () => {
    const kinds: Record<string, string> = GAME_CONFIG.gym.libraryCategoryKinds;
    for (const exercise of exerciseLibrary.exercises) {
      const sqlId = `'${exercise.id.replaceAll("'", "''")}'`;
      const sqlName = `'${exercise.name.replaceAll("'", "''")}'`;
      const row = rows.find((candidate) => candidate.startsWith(`  (${sqlId}, `));
      expect(row, exercise.id).toBeDefined();
      expect(row).toContain(
        `${sqlName}, '${exercise.category}', '${kinds[exercise.category] ?? '?'}'`,
      );
    }
  });

  it('upserts library rows by source id', () => {
    expect(exerciseLibraryMigration).toContain(
      'on conflict (source_id) where user_id is null do update',
    );
  });
});

describe('generated gym parity test (Step 2.5: e1RM)', () => {
  it('asserts every e1RM vector', () => {
    expect([...gymParityTest.matchAll(/public\.e1rm_centi\(/g)]).toHaveLength(
      gymVectors.e1rm.length,
    );
  });
});
