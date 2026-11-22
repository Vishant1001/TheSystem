import { GAME_CONFIG } from './config';

/**
 * C5: a game day starts at `startHour` wall-clock time in the hunter's own
 * timezone, so a session that runs past midnight still counts as the day it
 * started.
 *
 * This mirrors the SQL exactly:
 *   ((p_instant at time zone tz) - make_interval(hours => start_hour))::date
 *
 * Subtracting at most 23 hours from a wall clock can only ever move the date
 * back by one day, so the conversion is a date shift, never arithmetic on an
 * instant - which is what keeps it DST-safe and identical to Postgres.
 *
 * ADR-2: the instant is always passed in; this module never reads the clock.
 */
export function gameDateAt(
  instant: Date,
  timeZone: string,
  startHour: number = GAME_CONFIG.dayRollover.startHour,
): string {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('gameDateAt: instant is not a valid date');
  }
  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
    throw new RangeError(`gameDateAt: startHour must be an integer 0-23, received ${startHour}`);
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    if (part === undefined) {
      throw new RangeError(`gameDateAt: timezone ${timeZone} produced no ${type}`);
    }
    return Number(part.value);
  };

  const year = read('year');
  const month = read('month');
  const day = read('day');
  const hour = read('hour');

  // Whole-day shift when the wall clock is still before the rollover hour.
  const shifted = new Date(Date.UTC(year, month - 1, day));
  if (hour < startHour) {
    shifted.setUTCDate(shifted.getUTCDate() - 1);
  }
  return shifted.toISOString().slice(0, 10);
}

/** Convenience for the UI: the hunter's current game date. */
export function gameToday(timeZone: string, now: Date): string {
  return gameDateAt(now, timeZone);
}
