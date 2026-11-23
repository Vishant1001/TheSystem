import { describe, expect, it } from 'vitest';
import { gameDateAt } from './gameDate';
import { isOverdue, isScheduledOn, type ScheduleInput } from './schedule';
import vectors from './testdata/schedule-vectors.json';

/**
 * The TypeScript half of the quest scheduling parity suite.
 *
 * supabase/tests/quest_schedule_parity.sql is generated from this same file
 * and asserts the identical expectations against quest_scheduled_on() and
 * quest_overdue_on() in SQL. Expected values are hand-written in the JSON, so
 * neither implementation can define the truth for the other.
 *
 * Timestamps go through gameDateAt() exactly as the quest board does, which is
 * what puts the 03:00 rollover under test on both sides.
 */
function toScheduleInput(vector: (typeof vectors)[number]): ScheduleInput {
  const { quest, timezone } = vector;
  return {
    type: quest.type === 'one_time' || quest.type === 'trial' ? quest.type : 'daily',
    scheduleDays: quest.scheduleDays,
    dueOn: quest.dueOn,
    createdOn: gameDateAt(new Date(quest.createdAt), timezone),
    archivedOn: quest.archivedAt === null ? null : gameDateAt(new Date(quest.archivedAt), timezone),
  };
}

describe('quest schedule parity vectors', () => {
  it.each(vectors)('scheduled: $note', (vector) => {
    expect(isScheduledOn(toScheduleInput(vector), vector.day)).toBe(vector.expected.scheduled);
  });

  it.each(vectors)('overdue: $note', (vector) => {
    expect(isOverdue(toScheduleInput(vector), vector.day, vector.isDone)).toBe(
      vector.expected.overdue,
    );
  });

  it('exercises both outcomes, so a predicate stuck on one value would fail', () => {
    expect(vectors.some((vector) => vector.expected.scheduled)).toBe(true);
    expect(vectors.some((vector) => !vector.expected.scheduled)).toBe(true);
    expect(vectors.some((vector) => vector.expected.overdue)).toBe(true);
  });
});
