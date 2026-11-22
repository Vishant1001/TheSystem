import { GAME_CONFIG, type StatId } from './config';

const { startValue, xpBase, xpPerPoint } = GAME_CONFIG.stats;

/**
 * Brief 5.3: statXpToNext(v) = 30 + 3 * (v - 10).
 * `autoValue` is the auto-grown value only: allocated points never change the
 * cost of the next point.
 */
export function statXpToNext(autoValue: number): number {
  if (!Number.isInteger(autoValue) || autoValue < startValue) {
    throw new RangeError(
      `statXpToNext: autoValue must be an integer >= ${startValue}, received ${autoValue}`,
    );
  }
  return xpBase + xpPerPoint * (autoValue - startValue);
}

/** Cumulative stat XP needed for an auto value. Closed form of the arithmetic series. */
export function totalStatXpForValue(autoValue: number): number {
  if (!Number.isInteger(autoValue) || autoValue < startValue) {
    throw new RangeError(
      `totalStatXpForValue: autoValue must be an integer >= ${startValue}, received ${autoValue}`,
    );
  }
  const steps = autoValue - startValue;
  return xpBase * steps + (xpPerPoint * steps * (steps - 1)) / 2;
}

export interface StatProgress {
  autoValue: number;
  xpIntoPoint: number;
  xpForNext: number;
  totalStatXp: number;
}

/**
 * Walks the curve from the starting value. Solved in closed form (so there is no
 * unbounded loop) and then corrected by at most a couple of steps to absorb any
 * floating-point error at exact boundaries.
 */
export function statFromStatXp(totalStatXp: number): StatProgress {
  const clamped = Math.max(0, Math.floor(totalStatXp));

  let steps: number;
  if (xpPerPoint === 0) {
    steps = Math.floor(clamped / xpBase);
  } else {
    const a = xpPerPoint / 2;
    const b = xpBase - xpPerPoint / 2;
    steps = Math.floor((-b + Math.sqrt(b * b + 4 * a * clamped)) / (2 * a));
  }
  steps = Math.max(0, steps);

  while (totalStatXpForValue(startValue + steps + 1) <= clamped) steps += 1;
  while (steps > 0 && totalStatXpForValue(startValue + steps) > clamped) steps -= 1;

  const autoValue = startValue + steps;
  return {
    autoValue,
    xpIntoPoint: clamped - totalStatXpForValue(autoValue),
    xpForNext: statXpToNext(autoValue),
    totalStatXp: clamped,
  };
}

/** Brief 5.3: displayed stat = auto value + allocated points. */
export function displayedStatValue(totalStatXp: number, allocatedPoints: number): number {
  return statFromStatXp(totalStatXp).autoValue + Math.max(0, Math.floor(allocatedPoints));
}

export function emptyStatRecord(): Record<StatId, number> {
  return { STR: 0, AGI: 0, VIT: 0, INT: 0, SENSE: 0 };
}
