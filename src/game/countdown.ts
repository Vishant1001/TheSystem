import { GAME_CONFIG, type GameConfig, type PenaltyMode } from './config';
import { addDays, wallTimeToInstant } from './dates';
import { gameDateAt } from './gameDate';

export interface PenaltyCountdown {
  /** The game day `now` belongs to. */
  gameDate: string;
  /** When the warning window opens: the mode's warning hour on the game date. */
  warningStartsAt: Date;
  /** When the game day ends: the rollover hour on the next calendar date. */
  dayEndsAt: Date;
  /** True from the warning hour until the rollover. */
  inWarningWindow: boolean;
  /** Milliseconds until the day ends (never negative). */
  msRemaining: number;
}

/**
 * Brief 3.2: the countdown to the end of the game day, and whether the
 * warning window is open.
 *
 * Both edges are wall-clock times in the hunter's timezone, converted to
 * instants separately, so a DST change during the night shortens or lengthens
 * the window by exactly the hour the clocks moved.
 *
 * `mode` is the penalty mode in effect today (it is versioned, so callers pass
 * today's value, never tomorrow's). ADR-2: `now` is always passed in.
 */
export function penaltyCountdown(
  now: Date,
  timeZone: string,
  mode: PenaltyMode,
  config: GameConfig = GAME_CONFIG,
): PenaltyCountdown {
  const startHour = config.dayRollover.startHour;
  const gameDate = gameDateAt(now, timeZone, startHour);
  const warningStartsAt = wallTimeToInstant(
    gameDate,
    config.penalty.warningStartHour[mode],
    timeZone,
  );
  const dayEndsAt = wallTimeToInstant(addDays(gameDate, 1), startHour, timeZone);
  const nowMs = now.getTime();

  return {
    gameDate,
    warningStartsAt,
    dayEndsAt,
    inWarningWindow: nowMs >= warningStartsAt.getTime() && nowMs < dayEndsAt.getTime(),
    msRemaining: Math.max(0, dayEndsAt.getTime() - nowMs),
  };
}

/** `HH:MM:SS`, rounding up so the display reaches 00:00:00 only at the end. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

export type DayKind = 'normal' | 'rest' | 'safe';

/**
 * Brief 3.2: the red window shows inside the warning window while a core
 * quest is still open - never on a rest or safe day.
 */
export function shouldShowPenaltyWarning(input: {
  countdown: PenaltyCountdown;
  dayKind: DayKind;
  coreRemaining: number;
}): boolean {
  return input.countdown.inWarningWindow && input.dayKind === 'normal' && input.coreRemaining > 0;
}
