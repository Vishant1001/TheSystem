import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from './config';
import {
  levelFromTotalXp,
  rankFromLevel,
  roundToNearest,
  totalXpForLevel,
  xpToNext,
} from './levels';

const { maxLevel } = GAME_CONFIG.levels;

describe('roundToNearest', () => {
  it('rounds half up (G5)', () => {
    expect(roundToNearest(1025)).toBe(1030);
    expect(roundToNearest(1024.99)).toBe(1020);
    expect(roundToNearest(5)).toBe(10);
    expect(roundToNearest(4.99)).toBe(0);
  });
});

describe('xpToNext', () => {
  it('matches the sanity values from the brief (5.1)', () => {
    expect(xpToNext(1)).toBe(60);
    expect(xpToNext(10)).toBe(350);
    expect(xpToNext(20)).toBe(1030);
    expect(xpToNext(30)).toBe(2000);
  });

  it('is strictly increasing', () => {
    for (let level = 1; level < 200; level += 1) {
      expect(xpToNext(level + 1)).toBeGreaterThan(xpToNext(level));
    }
  });

  it('always returns a multiple of the rounding step', () => {
    for (let level = 1; level < 300; level += 1) {
      expect(xpToNext(level) % GAME_CONFIG.levels.roundTo).toBe(0);
    }
  });

  it('rejects levels outside the playable range', () => {
    expect(() => xpToNext(0)).toThrow(RangeError);
    expect(() => xpToNext(-3)).toThrow(RangeError);
    expect(() => xpToNext(1.5)).toThrow(RangeError);
    expect(() => xpToNext(maxLevel)).toThrow(RangeError);
  });
});

describe('levelFromTotalXp', () => {
  it('starts hunters at level 1 with 0 XP', () => {
    expect(levelFromTotalXp(0)).toEqual({
      level: 1,
      xpIntoLevel: 0,
      xpForNext: 60,
      totalXp: 0,
      isMaxLevel: false,
    });
  });

  it('clamps negative totals to zero (5.1)', () => {
    const progress = levelFromTotalXp(-5000);
    expect(progress.level).toBe(1);
    expect(progress.totalXp).toBe(0);
    expect(progress.xpIntoLevel).toBe(0);
  });

  it('holds the level one XP short of the threshold', () => {
    expect(levelFromTotalXp(59).level).toBe(1);
    expect(levelFromTotalXp(59).xpIntoLevel).toBe(59);
  });

  it('levels up exactly on the threshold', () => {
    const progress = levelFromTotalXp(60);
    expect(progress.level).toBe(2);
    expect(progress.xpIntoLevel).toBe(0);
    expect(progress.xpForNext).toBe(xpToNext(2));
  });

  it('property: the sum of xpToNext(1..k) lands exactly on level k+1 (5.1)', () => {
    for (let k = 1; k <= 120; k += 1) {
      const total = totalXpForLevel(k + 1);
      const progress = levelFromTotalXp(total);
      expect(progress.level).toBe(k + 1);
      expect(progress.xpIntoLevel).toBe(0);
      expect(levelFromTotalXp(total - 1).level).toBe(k);
    }
  });

  it('property: xpIntoLevel never reaches xpForNext', () => {
    for (let total = 0; total < 5000; total += 7) {
      const progress = levelFromTotalXp(total);
      expect(progress.xpIntoLevel).toBeLessThan(progress.xpForNext);
      expect(progress.xpIntoLevel).toBeGreaterThanOrEqual(0);
    }
  });

  it('stops at the max level guard instead of looping forever (G4)', () => {
    const progress = levelFromTotalXp(Number.MAX_SAFE_INTEGER);
    expect(progress.level).toBe(maxLevel);
    expect(progress.isMaxLevel).toBe(true);
    expect(progress.xpForNext).toBe(0);
  });

  it('floors fractional XP', () => {
    expect(levelFromTotalXp(59.9).xpIntoLevel).toBe(59);
  });
});

describe('rankFromLevel', () => {
  it('maps the rank bands from the brief (5.2)', () => {
    const cases: [number, string][] = [
      [1, 'E'],
      [9, 'E'],
      [10, 'D'],
      [19, 'D'],
      [20, 'C'],
      [29, 'C'],
      [30, 'B'],
      [44, 'B'],
      [45, 'A'],
      [59, 'A'],
      [60, 'S'],
      [999, 'S'],
    ];
    for (const [level, rank] of cases) {
      expect(rankFromLevel(level)).toBe(rank);
    }
  });
});
