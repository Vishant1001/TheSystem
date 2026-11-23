/**
 * Which quests belong to which game day.
 *
 * This mirrors the predicate close_days() uses in SQL (brief 6.4 step 2). The
 * database is authoritative for tallying a day; this copy exists so the client
 * can render today's list without a round trip. Both must agree, so the rules
 * live here as a pure function with tests rather than inline in a component.
 */

/** 'trial' is a Survival Trial (brief 3.4): pinned to the board, owned by no day. */
export type QuestType = 'daily' | 'one_time' | 'trial';

export interface ScheduleInput {
  type: QuestType;
  /** ISO weekdays 1-7, daily quests only. */
  scheduleDays: readonly number[] | null;
  /** one_time quests only; null means "no day owns it". */
  dueOn: string | null;
  /** Game date the quest was created, as YYYY-MM-DD. */
  createdOn: string;
  /** Game date the quest was archived, or null while active. */
  archivedOn: string | null;
}

/** ISO weekday (Monday = 1 ... Sunday = 7) for a YYYY-MM-DD game date. */
export function isoWeekday(day: string): number {
  const parts = day.split('-').map(Number);
  const [year, month, date] = parts;
  if (
    parts.length !== 3 ||
    year === undefined ||
    month === undefined ||
    date === undefined ||
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(date)
  ) {
    throw new RangeError(`isoWeekday: expected YYYY-MM-DD, received ${day}`);
  }
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** True while the quest existed and had not yet been archived on that day. */
export function wasActiveOn(input: ScheduleInput, day: string): boolean {
  if (input.createdOn > day) return false;
  if (input.archivedOn !== null && input.archivedOn <= day) return false;
  return true;
}

/**
 * True when the quest counts towards that day: the exact rule close_days()
 * applies when tallying core quests.
 */
export function isScheduledOn(input: ScheduleInput, day: string): boolean {
  if (!wasActiveOn(input, day)) return false;
  // A trial is never core and never tallied; its deadline is an instant.
  if (input.type === 'trial') return false;

  if (input.type === 'daily') {
    if (input.scheduleDays === null || input.scheduleDays.length === 0) return false;
    return input.scheduleDays.includes(isoWeekday(day));
  }

  // G10: a one-time quest counts only on its due day. An undated one never
  // counts, which is why such a quest can never be core.
  return input.dueOn !== null && input.dueOn === day;
}

/** A dated one-time quest whose day has passed and which is still outstanding. */
export function isOverdue(input: ScheduleInput, day: string, isDone: boolean): boolean {
  if (input.type !== 'one_time' || isDone) return false;
  return input.dueOn !== null && input.dueOn < day;
}
