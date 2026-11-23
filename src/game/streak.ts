import { GAME_CONFIG, type GameConfig, type PenaltyMode } from './config';
import type { StreakEffect } from './dayStatus';

/** Brief 3.6: a failed day resets, a counted clear extends, everything else holds. */
export function nextStreak(previous: number, effect: StreakEffect): number {
  if (effect === 'reset') return 0;
  if (effect === 'extend') return previous + 1;
  return previous;
}

/**
 * A stone is earned when a close moves the streak onto a multiple of the
 * interval, while fewer than the cap are held. Hardcore earns none.
 * `mode` is the penalty mode in effect on the day being closed.
 */
export function earnsStone(
  input: { streakBefore: number; streakAfter: number; held: number; mode: PenaltyMode },
  config: GameConfig = GAME_CONFIG,
): boolean {
  const { streakInterval, maxHeld } = config.stones;
  return (
    input.mode !== 'hardcore' &&
    input.streakAfter > input.streakBefore &&
    input.streakAfter % streakInterval === 0 &&
    input.held < maxHeld
  );
}

/** Hardcore keeps held stones frozen: they cannot be spent while it is active. */
export function canSpendStone(held: number, mode: PenaltyMode): boolean {
  return mode !== 'hardcore' && held > 0;
}

/** Held stones = the sum of the append-only +1 / -1 events. */
export function stonesHeld(events: readonly number[]): number {
  return events.reduce((sum, delta) => sum + delta, 0);
}

export interface StreakDay {
  effect: StreakEffect;
  mode: PenaltyMode;
  /** Stones spent after this day closed (redemptions), applied before the next close. */
  spentAfter?: number;
}

export interface StreakStep {
  streak: number;
  stoneEarned: boolean;
  held: number;
}

/** Replays closes in order. Used by tests and to document the rule end to end. */
export function replayStreak(
  days: readonly StreakDay[],
  start: { streak: number; held: number } = { streak: 0, held: 0 },
  config: GameConfig = GAME_CONFIG,
): StreakStep[] {
  let streak = start.streak;
  let held = start.held;
  return days.map((day) => {
    const streakAfter = nextStreak(streak, day.effect);
    const stoneEarned = earnsStone(
      { streakBefore: streak, streakAfter, held, mode: day.mode },
      config,
    );
    streak = streakAfter;
    held += stoneEarned ? 1 : 0;
    const step = { streak, stoneEarned, held };
    held -= day.spentAfter ?? 0;
    return step;
  });
}
