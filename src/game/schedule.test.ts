import { describe, expect, it } from 'vitest';
import { isOverdue, isScheduledOn, isoWeekday, wasActiveOn, type ScheduleInput } from './schedule';

function daily(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    type: 'daily',
    scheduleDays: [1, 2, 3, 4, 5, 6, 7],
    dueOn: null,
    createdOn: '2026-01-01',
    archivedOn: null,
    ...overrides,
  };
}

function oneTime(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    type: 'one_time',
    scheduleDays: null,
    dueOn: '2026-01-10',
    createdOn: '2026-01-01',
    archivedOn: null,
    ...overrides,
  };
}

describe('isoWeekday', () => {
  it('counts Monday as 1 and Sunday as 7', () => {
    expect(isoWeekday('2026-01-05')).toBe(1); // Monday
    expect(isoWeekday('2026-01-10')).toBe(6); // Saturday
    expect(isoWeekday('2026-01-11')).toBe(7); // Sunday
  });

  it('rejects anything that is not a game date', () => {
    expect(() => isoWeekday('05/01/2026')).toThrow(RangeError);
    expect(() => isoWeekday('')).toThrow(RangeError);
  });
});

describe('wasActiveOn', () => {
  it('excludes days before the quest existed', () => {
    expect(wasActiveOn(daily({ createdOn: '2026-01-05' }), '2026-01-04')).toBe(false);
    expect(wasActiveOn(daily({ createdOn: '2026-01-05' }), '2026-01-05')).toBe(true);
  });

  it('excludes the day it was archived and everything after', () => {
    const quest = daily({ archivedOn: '2026-01-08' });
    expect(wasActiveOn(quest, '2026-01-07')).toBe(true);
    expect(wasActiveOn(quest, '2026-01-08')).toBe(false);
    expect(wasActiveOn(quest, '2026-01-09')).toBe(false);
  });
});

describe('isScheduledOn', () => {
  it('respects the weekday schedule of a daily quest', () => {
    const weekdaysOnly = daily({ scheduleDays: [1, 2, 3, 4, 5] });
    expect(isScheduledOn(weekdaysOnly, '2026-01-09')).toBe(true); // Friday
    expect(isScheduledOn(weekdaysOnly, '2026-01-10')).toBe(false); // Saturday
  });

  it('counts a one-time quest on its due day only (G10)', () => {
    const quest = oneTime();
    expect(isScheduledOn(quest, '2026-01-09')).toBe(false);
    expect(isScheduledOn(quest, '2026-01-10')).toBe(true);
    expect(isScheduledOn(quest, '2026-01-11')).toBe(false);
  });

  it('never counts an undated one-time quest, which is why it cannot be core', () => {
    expect(isScheduledOn(oneTime({ dueOn: null }), '2026-01-10')).toBe(false);
  });

  it('ignores quests that did not exist yet or were already archived', () => {
    expect(isScheduledOn(daily({ createdOn: '2026-02-01' }), '2026-01-10')).toBe(false);
    expect(isScheduledOn(daily({ archivedOn: '2026-01-10' }), '2026-01-10')).toBe(false);
  });

  it('treats an empty schedule as never', () => {
    expect(isScheduledOn(daily({ scheduleDays: [] }), '2026-01-05')).toBe(false);
    expect(isScheduledOn(daily({ scheduleDays: null }), '2026-01-05')).toBe(false);
  });
});

describe('isOverdue', () => {
  it('flags an outstanding dated one-time quest after its day', () => {
    expect(isOverdue(oneTime(), '2026-01-11', false)).toBe(true);
    expect(isOverdue(oneTime(), '2026-01-10', false)).toBe(false);
  });

  it('never flags a completed, undated or daily quest', () => {
    expect(isOverdue(oneTime(), '2026-01-11', true)).toBe(false);
    expect(isOverdue(oneTime({ dueOn: null }), '2026-01-11', false)).toBe(false);
    expect(isOverdue(daily(), '2026-01-11', false)).toBe(false);
  });
});
