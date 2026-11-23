/**
 * Calendar helpers for YYYY-MM-DD game dates, and the one conversion from a
 * wall-clock time in a timezone back to an instant.
 *
 * ADR-2: nothing here reads the clock. Every instant is passed in.
 */

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function dayToUtcMs(day: string): number {
  const match = DAY_PATTERN.exec(day);
  if (match === null) throw new RangeError(`expected YYYY-MM-DD, received ${day}`);
  const [, year, month, date] = match;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(date));
  if (new Date(ms).toISOString().slice(0, 10) !== day) {
    throw new RangeError(`not a calendar date: ${day}`);
  }
  return ms;
}

/** `day` shifted by `days` calendar days (negative goes back). */
export function addDays(day: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError(`addDays: days must be an integer`);
  return new Date(dayToUtcMs(day) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dayToUtcMs(to) - dayToUtcMs(from)) / MS_PER_DAY);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The zone's UTC offset in ms at an instant (wall clock minus UTC). */
function offsetAt(instantMs: number, timeZone: string): number {
  const wholeSecond = Math.floor(instantMs / 1000) * 1000;
  const parts = formatterFor(timeZone).formatToParts(new Date(wholeSecond));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    if (part === undefined) throw new RangeError(`timezone ${timeZone} produced no ${type}`);
    return Number(part.value);
  };
  const wall = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  );
  return wall - wholeSecond;
}

/**
 * The instant at which the wall clock in `timeZone` shows `hour`:00 on `day`.
 *
 * Daylight-saving edges are resolved the way Postgres' `timestamp at time
 * zone` resolves them, so SQL and the engine agree:
 * - a repeated hour (clocks go back) takes the offset in force after the
 *   transition, i.e. the later instant;
 * - a skipped hour (clocks go forward) is pushed forward by the gap, so
 *   02:30 on a spring-forward night means 03:30 summer time.
 */
export function wallTimeToInstant(day: string, hour: number, timeZone: string): Date {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`wallTimeToInstant: hour must be 0-23, received ${hour}`);
  }
  const wallMs = dayToUtcMs(day) + hour * 3_600_000;
  const offsetBefore = offsetAt(wallMs - MS_PER_DAY, timeZone);
  const offsetAfter = offsetAt(wallMs + MS_PER_DAY, timeZone);

  const candidates = [offsetBefore, offsetAfter]
    .map((offset) => wallMs - offset)
    .filter((instant) => instant + offsetAt(instant, timeZone) === wallMs)
    .sort((a, b) => a - b);
  // Both offsets can be valid only inside a repeated hour.

  const latest = candidates[candidates.length - 1];
  if (latest !== undefined) return new Date(latest);
  // Skipped hour: keep the pre-transition offset, which lands after the gap.
  return new Date(wallMs - offsetBefore);
}
