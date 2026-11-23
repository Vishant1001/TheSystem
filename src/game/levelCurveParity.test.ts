import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from './config';
import { xpToNext } from './levels';
import vectors from './testdata/level-curve-vectors.json';

/**
 * ADR-4 as amended in Phase 2: SQL may read the level curve (XP Debt is sized
 * from xpToNext at close time). These vectors pin every level; the SQL half
 * is generated from the same JSON when the SQL port lands (2.3).
 */
describe('level curve parity vectors', () => {
  it('covers every level below the max', () => {
    const { startLevel, maxLevel } = GAME_CONFIG.levels;
    expect(vectors.startLevel).toBe(startLevel);
    expect(vectors.xpToNext).toHaveLength(maxLevel - startLevel);
  });

  it('agrees with the brief sanity values (5.1)', () => {
    const at = (level: number) => vectors.xpToNext[level - vectors.startLevel];
    expect(at(1)).toBe(60);
    expect(at(10)).toBe(350);
    expect(at(20)).toBe(1030);
    expect(at(30)).toBe(2000);
  });

  it('matches the engine at every level', () => {
    vectors.xpToNext.forEach((expected, index) => {
      expect(xpToNext(vectors.startLevel + index)).toBe(expected);
    });
  });

  it('keeps every raw value clear of a rounding tie, so precision cannot flip one', () => {
    const { base, coefficient, exponent, roundTo, startLevel, maxLevel } = GAME_CONFIG.levels;
    let margin = 1;
    for (let level = startLevel; level < maxLevel; level += 1) {
      const raw = (base + coefficient * Math.pow(level, exponent)) / roundTo;
      margin = Math.min(margin, Math.abs(raw - Math.floor(raw) - 0.5));
    }
    expect(margin).toBeGreaterThan(1e-6);
    expect(vectors.minHalfMargin).toBeGreaterThan(1e-6);
  });
});
