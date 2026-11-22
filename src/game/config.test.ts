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
    });
  });
});
