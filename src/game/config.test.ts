import { describe, expect, it } from 'vitest';
import { CATEGORIES, DIFFICULTIES, GAME_CONFIG, STAT_IDS, sqlConfigSlice } from './config';

/**
 * These assertions pin the config file to the numbers written in the brief.
 * Changing a game number should mean changing the brief and this test together,
 * never the config alone.
 */
describe('game config', () => {
  it('holds the level curve constants (5.1)', () => {
    expect(GAME_CONFIG.levels).toMatchObject({
      base: 50,
      coefficient: 6,
      exponent: 1.7,
      roundTo: 10,
      startLevel: 1,
    });
  });

  it('holds the day rollover hour (C5)', () => {
    expect(GAME_CONFIG.dayRollover).toEqual({ startHour: 3 });
  });

  it('holds the day close backfill cap (G8)', () => {
    expect(GAME_CONFIG.dayClose).toEqual({ maxBackfillDays: 30 });
  });

  it('holds the rank bands (5.2)', () => {
    expect(GAME_CONFIG.ranks).toEqual([
      { rank: 'E', minLevel: 1 },
      { rank: 'D', minLevel: 10 },
      { rank: 'C', minLevel: 20 },
      { rank: 'B', minLevel: 30 },
      { rank: 'A', minLevel: 45 },
      { rank: 'S', minLevel: 60 },
    ]);
  });

  it('holds the stat curve (5.3)', () => {
    expect(GAME_CONFIG.stats).toEqual({
      ids: ['STR', 'AGI', 'VIT', 'INT', 'SENSE'],
      startValue: 10,
      xpBase: 30,
      xpPerPoint: 3,
    });
    expect(STAT_IDS).toEqual(GAME_CONFIG.stats.ids);
  });

  it('holds the free point rules (5.4)', () => {
    expect(GAME_CONFIG.freePoints).toEqual({ perLevel: 3, perDailyClear: 1 });
  });

  it('holds the quest reward table (5.5)', () => {
    expect(GAME_CONFIG.rewards.xpByDifficulty).toEqual({
      E: 10,
      D: 20,
      C: 35,
      B: 50,
      A: 75,
      S: 100,
    });
    expect(Object.keys(GAME_CONFIG.rewards.xpByDifficulty).sort()).toEqual(
      [...DIFFICULTIES].sort(),
    );
    expect(GAME_CONFIG.rewards.statXpDivisor).toBe(2);
    expect(GAME_CONFIG.rewards.minStatXpPerTag).toBe(1);
    expect(GAME_CONFIG.rewards.maxStatTags).toBe(2);
  });

  it('holds the daily caps (5.6)', () => {
    expect(GAME_CONFIG.dailyCaps).toEqual({ fitness: 150, diet: 100, life: 150 });
    expect(Object.keys(GAME_CONFIG.dailyCaps).sort()).toEqual([...CATEGORIES].sort());
  });
});

describe('sqlConfigSlice', () => {
  it('exposes exactly what the database needs (ADR-4)', () => {
    expect(sqlConfigSlice()).toEqual({
      version: GAME_CONFIG.version,
      quest_xp_by_difficulty: { E: 10, D: 20, C: 35, B: 50, A: 75, S: 100 },
      daily_caps: { fitness: 150, diet: 100, life: 150 },
      stat_xp_divisor: 2,
      min_stat_xp_per_tag: 1,
      game_day_start_hour: 3,
      free_points_per_daily_clear: 1,
      close_days_max_backfill: 30,
      level_curve: GAME_CONFIG.levels,
      stat_order: ['STR', 'AGI', 'VIT', 'INT', 'SENSE'],
      award_sources: GAME_CONFIG.awardSources,
      penalty: GAME_CONFIG.penalty,
      stones: GAME_CONFIG.stones,
      safe_zones: GAME_CONFIG.safeZones,
      gym: GAME_CONFIG.gym,
    });
  });
});

describe('Phase 2 config', () => {
  it('holds the penalty modes and warning hours (3.1)', () => {
    expect(GAME_CONFIG.penalty.modes).toEqual(['lenient', 'standard', 'hardcore']);
    expect(GAME_CONFIG.penalty.defaultMode).toBe('standard');
    expect(GAME_CONFIG.penalty.warningStartHour).toEqual({
      lenient: 21,
      standard: 23,
      hardcore: 23,
    });
  });

  it('holds the debt rates and the repayment share (3.4)', () => {
    expect(GAME_CONFIG.penalty.debtRatePercent).toEqual({
      lenient: 10,
      standard: 20,
      escalated: 30,
    });
    expect(GAME_CONFIG.penalty.debtRepaymentDivisor).toBe(2);
  });

  it('holds the trial rules, and no trial is about eating less (3.4)', () => {
    const { trial } = GAME_CONFIG.penalty;
    expect(trial.xp).toBe(20);
    expect(trial.deadlineHours).toBe(24);
    expect(trial.templates.fitness).toMatchObject({
      goalType: 'duration',
      target: 15,
      statTags: ['STR', 'AGI'],
    });
    expect(trial.templates.diet).toMatchObject({
      goalType: 'count',
      target: 3,
      statTags: ['VIT'],
      tracking: 'auto_food_count',
    });
    expect(trial.templates.life).toMatchObject({
      goalType: 'duration',
      target: 45,
      statTags: ['INT'],
    });
    for (const category of CATEGORIES) {
      expect(trial.templates[category].title).not.toMatch(/calorie|kcal|deficit|fast/i);
    }
  });

  it('holds the Weakened length and tie-break orders (3.4)', () => {
    expect(GAME_CONFIG.penalty.weakenedDays).toBe(2);
    expect(GAME_CONFIG.penalty.categoryOrder).toEqual(['fitness', 'diet', 'life']);
  });

  it('holds the award source exemptions (3.4, 4.3 - 4.5)', () => {
    expect(GAME_CONFIG.awardSources).toEqual({
      quest: { capped: true, repaysDebt: true },
      workout: { capped: true, repaysDebt: true },
      pr: { capped: false, repaysDebt: true },
      boss: { capped: false, repaysDebt: false },
      trial: { capped: false, repaysDebt: false },
      daily_clear: { capped: false, repaysDebt: false },
    });
  });

  it('holds the stone and safe zone limits (3.6 - 3.8)', () => {
    expect(GAME_CONFIG.stones).toEqual({ streakInterval: 7, maxHeld: 3 });
    expect(GAME_CONFIG.safeZones).toEqual({
      maxRestDays: 2,
      minPeriodDays: 1,
      maxPeriodDays: 7,
      quotaDays: 10,
      quotaWindowDays: 30,
    });
  });

  it('holds the gym numbers (4.1 - 4.6, step 0 G-i)', () => {
    const { gym } = GAME_CONFIG;
    expect(gym.kinds).toEqual({ strength: 'STR', cardio: 'AGI', mobility: 'VIT' });
    expect(gym.libraryCategoryKinds).toEqual({
      strength: 'strength',
      powerlifting: 'strength',
      'olympic weightlifting': 'strength',
      strongman: 'strength',
      cardio: 'cardio',
      plyometrics: 'cardio',
      stretching: 'mobility',
    });
    expect(gym.setXp).toBe(2);
    expect(gym.maxWorkingSetsPerDay).toBe(20);
    expect(gym.pr).toEqual({
      xp: 25,
      statXp: 10,
      maxBonusesPerDay: 2,
      e1rmMinReps: 1,
      e1rmMaxReps: 12,
      e1rmRepsDivisor: 30,
      kinds: ['strength'],
    });
    expect(gym.boss).toEqual({
      xpMultiplier: 2,
      freePoints: 1,
      maxActive: 5,
      defaultTargetReps: 1,
      kinds: ['strength'],
    });
    expect(gym.restTimer.defaultSeconds).toBe(90);
    expect(gym.restTimer.stepSeconds).toBe(15);
  });
});
