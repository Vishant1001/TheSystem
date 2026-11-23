import { GAME_CONFIG, type GameConfig, type PenaltyMode } from './config';
import { addDays, daysBetween, wallTimeToInstant } from './dates';
import { gameDateAt } from './gameDate';

/** Brief 3.8. */
export type SafeKind = 'sick' | 'travel';

export interface SafePeriod {
  startOn: string;
  endOn: string;
  /**
   * The first game day that is no longer safe after "End early", or null.
   * Ending early applies from the next game day, so this is always the day
   * after the one on which it was ended.
   */
  endedEarlyOn: string | null;
}

/** The last safe day of a period; before `startOn` when it was cancelled outright. */
export function effectiveEnd(period: SafePeriod): string {
  if (period.endedEarlyOn === null) return period.endOn;
  const lastSafe = addDays(period.endedEarlyOn, -1);
  return lastSafe < period.endOn ? lastSafe : period.endOn;
}

export function isSafeOn(periods: readonly SafePeriod[], day: string): boolean {
  return periods.some((period) => day >= period.startOn && day <= effectiveEnd(period));
}

/**
 * Brief 3.8 / step 0 (G-l): a period starts today only when activated before
 * today's warning time, judged by the mode in effect today; otherwise tomorrow.
 */
export function safePeriodStart(
  now: Date,
  timeZone: string,
  mode: PenaltyMode,
  config: GameConfig = GAME_CONFIG,
): string {
  const today = gameDateAt(now, timeZone, config.dayRollover.startHour);
  const warning = wallTimeToInstant(today, config.penalty.warningStartHour[mode], timeZone);
  return now.getTime() < warning.getTime() ? today : addDays(today, 1);
}

function countSafeDays(periods: readonly SafePeriod[], from: string, to: string): number {
  let count = 0;
  for (const period of periods) {
    const start = period.startOn > from ? period.startOn : from;
    const endOfPeriod = effectiveEnd(period);
    const end = endOfPeriod < to ? endOfPeriod : to;
    if (end >= start) count += daysBetween(start, end) + 1;
  }
  return count;
}

export type SafePeriodRefusal =
  'SAFE_PERIOD_LENGTH' | 'SAFE_PERIOD_OVERLAP' | 'SAFE_QUOTA_EXCEEDED';

/**
 * Whether a new period of `days` days starting on `startOn` may be booked.
 *
 * Step 0 (G-k): the quota counts booked days (an early end gives the unused
 * ones back), and every rolling window that would contain a new day must stay
 * within the quota.
 */
export function checkSafePeriod(
  existing: readonly SafePeriod[],
  startOn: string,
  days: number,
  config: GameConfig = GAME_CONFIG,
): SafePeriodRefusal | null {
  const { minPeriodDays, maxPeriodDays, quotaDays, quotaWindowDays } = config.safeZones;
  if (!Number.isInteger(days) || days < minPeriodDays || days > maxPeriodDays) {
    return 'SAFE_PERIOD_LENGTH';
  }
  const endOn = addDays(startOn, days - 1);
  if (existing.some((period) => period.startOn <= endOn && effectiveEnd(period) >= startOn)) {
    return 'SAFE_PERIOD_OVERLAP';
  }
  const all = [...existing, { startOn, endOn, endedEarlyOn: null }];
  for (let windowEnd = startOn; windowEnd <= addDays(endOn, quotaWindowDays - 1);) {
    const windowStart = addDays(windowEnd, -(quotaWindowDays - 1));
    if (countSafeDays(all, windowStart, windowEnd) > quotaDays) return 'SAFE_QUOTA_EXCEEDED';
    windowEnd = addDays(windowEnd, 1);
  }
  return null;
}

/** The longest period that could be booked from `startOn` (0 when none). */
export function maxBookableDays(
  existing: readonly SafePeriod[],
  startOn: string,
  config: GameConfig = GAME_CONFIG,
): number {
  for (
    let days = config.safeZones.maxPeriodDays;
    days >= config.safeZones.minPeriodDays;
    days -= 1
  ) {
    if (checkSafePeriod(existing, startOn, days, config) === null) return days;
  }
  return 0;
}

/** "End early" takes effect from the next game day. */
export function endEarlyOn(today: string): string {
  return addDays(today, 1);
}
