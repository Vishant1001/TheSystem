import { GAME_CONFIG, type GameConfig } from './config';

/** Brief 4.6: the rest timer, as pure arithmetic over a persisted start instant. */

export function clampRestSeconds(seconds: number, config: GameConfig = GAME_CONFIG): number {
  const { minSeconds, maxSeconds } = config.gym.restTimer;
  return Math.min(maxSeconds, Math.max(minSeconds, Math.round(seconds)));
}

/** The +/- buttons move by one configured step, within the limits. */
export function adjustRestSeconds(
  seconds: number,
  steps: number,
  config: GameConfig = GAME_CONFIG,
): number {
  return clampRestSeconds(seconds + steps * config.gym.restTimer.stepSeconds, config);
}

export interface RestTimerState {
  remainingMs: number;
  finished: boolean;
}

export function restTimerState(
  startedAtMs: number,
  durationSeconds: number,
  nowMs: number,
): RestTimerState {
  const remainingMs = Math.max(0, startedAtMs + durationSeconds * 1000 - nowMs);
  return { remainingMs, finished: remainingMs === 0 };
}
