import { GAME_CONFIG, type Rank } from './config';

const { base, coefficient, exponent, roundTo, startLevel, maxLevel } = GAME_CONFIG.levels;

/** Half-up rounding to a step (G5). Only ever called with positive values. */
export function roundToNearest(value: number, step: number = roundTo): number {
  return Math.round(value / step) * step;
}

/**
 * XP needed to go from `level` to `level + 1`.
 * Brief 5.1: roundToNearest10(50 + 6 * n^1.7)
 */
export function xpToNext(level: number): number {
  if (!Number.isInteger(level)) {
    throw new RangeError(`xpToNext: level must be an integer, received ${level}`);
  }
  if (level < startLevel || level >= maxLevel) {
    throw new RangeError(
      `xpToNext: level must be within [${startLevel}, ${maxLevel - 1}], received ${level}`,
    );
  }
  return roundToNearest(base + coefficient * Math.pow(level, exponent));
}

/** Cumulative XP required to reach `level` from the starting level. */
export function totalXpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < startLevel || level > maxLevel) {
    throw new RangeError(
      `totalXpForLevel: level must be within [${startLevel}, ${maxLevel}], received ${level}`,
    );
  }
  let total = 0;
  for (let n = startLevel; n < level; n += 1) {
    total += xpToNext(n);
  }
  return total;
}

export interface LevelProgress {
  level: number;
  /** XP accumulated inside the current level. */
  xpIntoLevel: number;
  /** XP needed to reach the next level; 0 at max level. */
  xpForNext: number;
  /** The clamped, floored total XP this progress was derived from. */
  totalXp: number;
  isMaxLevel: boolean;
}

/**
 * Brief 5.1: total XP can never drag the level below the starting level, so
 * negative totals clamp to 0. The loop is bounded by maxLevel (G4).
 */
export function levelFromTotalXp(totalXp: number): LevelProgress {
  const clamped = Math.max(0, Math.floor(totalXp));
  let level = startLevel;
  let remaining = clamped;

  while (level < maxLevel) {
    const needed = xpToNext(level);
    if (remaining < needed) break;
    remaining -= needed;
    level += 1;
  }

  const isMaxLevel = level >= maxLevel;
  return {
    level,
    xpIntoLevel: remaining,
    xpForNext: isMaxLevel ? 0 : xpToNext(level),
    totalXp: clamped,
    isMaxLevel,
  };
}

/** Brief 5.2: rank is purely level-derived in Phase 1. */
export function rankFromLevel(level: number): Rank {
  const ranks = GAME_CONFIG.ranks;
  let current = ranks[0]!.rank;
  for (const entry of ranks) {
    if (level >= entry.minLevel) current = entry.rank;
    else break;
  }
  return current;
}
