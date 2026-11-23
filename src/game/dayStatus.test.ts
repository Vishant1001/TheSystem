import { describe, expect, it } from 'vitest';
import { countsTowardCoreTally, evaluateDay, isRestDay, isValidRestDays } from './dayStatus';
import { canSpendStone, earnsStone, nextStreak, replayStreak, stonesHeld } from './streak';
import type { PenaltyMode } from './config';
import type { StreakEffect } from './dayStatus';
import dayVectors from './testdata/day-status-vectors.json';
import streakVectors from './testdata/streak-vectors.json';

/**
 * TypeScript half of the day-outcome and streak parity suites. The SQL half
 * is generated from the same JSON in the step that adds the SQL (2.2).
 * Expected values are written by hand.
 */
describe('day outcome vectors (3.7 - 3.9)', () => {
  it.each(dayVectors)('$note', (vector) => {
    expect(
      evaluateDay({
        day: vector.day,
        phase2Rules: vector.phase2Rules,
        restDays: vector.restDays,
        safe: vector.safe,
        quests: vector.quests,
      }),
    ).toEqual(vector.expected);
  });

  it('covers every status', () => {
    const statuses = new Set(dayVectors.map((vector) => vector.expected.status));
    expect([...statuses].sort()).toEqual(['cleared', 'failed', 'rest', 'safe']);
  });
});

describe('rest days', () => {
  it('accepts zero to two distinct ISO weekdays', () => {
    expect(isValidRestDays([])).toBe(true);
    expect(isValidRestDays([6, 7])).toBe(true);
    expect(isValidRestDays([1, 6, 7])).toBe(false);
    expect(isValidRestDays([6, 6])).toBe(false);
    expect(isValidRestDays([0])).toBe(false);
    expect(isValidRestDays([8])).toBe(false);
  });

  it('matches the weekday of the game date', () => {
    expect(isRestDay('2026-12-12', [6])).toBe(true); // Saturday
    expect(isRestDay('2026-12-11', [6])).toBe(false);
  });

  it('only counts rest-day quests on a rest day', () => {
    const quest = { isCore: true, onRestDays: false, scheduled: true, done: false };
    expect(countsTowardCoreTally(quest, false)).toBe(true);
    expect(countsTowardCoreTally(quest, true)).toBe(false);
    expect(countsTowardCoreTally({ ...quest, onRestDays: true }, true)).toBe(true);
    expect(countsTowardCoreTally({ ...quest, isCore: false, onRestDays: true }, true)).toBe(false);
  });

  it('never creates a penalty, whatever is missed', () => {
    for (const restDays of [[6], [6, 7]]) {
      const outcome = evaluateDay({
        day: '2026-12-12',
        phase2Rules: true,
        restDays,
        safe: false,
        quests: [
          { isCore: true, onRestDays: true, scheduled: true, done: false },
          { isCore: true, onRestDays: false, scheduled: true, done: false },
        ],
      });
      expect(outcome.createsPenalty).toBe(false);
    }
  });
});

const EFFECTS: Record<string, StreakEffect> = { E: 'extend', R: 'reset', N: 'neutral' };
const MODES: Record<string, PenaltyMode> = { L: 'lenient', S: 'standard', H: 'hardcore' };

describe('streak and stone vectors (3.6)', () => {
  it.each(streakVectors)('$note', (vector) => {
    const spent: Partial<Record<string, number>> = vector.spentAfter;
    const days = [...vector.effects].map((letter, index) => ({
      effect: EFFECTS[letter]!,
      mode: MODES[vector.modes[index]!]!,
      spentAfter: spent[String(index + 1)] ?? 0,
    }));
    const steps = replayStreak(days);
    const last = steps[steps.length - 1]!;
    expect(last.streak).toBe(vector.expected.finalStreak);
    expect(last.held - (days[days.length - 1]!.spentAfter ?? 0)).toBe(vector.expected.finalHeld);
    expect(steps.flatMap((step, index) => (step.stoneEarned ? [index + 1] : []))).toEqual(
      vector.expected.stoneDays,
    );
  });
});

describe('streak rules', () => {
  it('extends, resets and holds', () => {
    expect(nextStreak(4, 'extend')).toBe(5);
    expect(nextStreak(4, 'reset')).toBe(0);
    expect(nextStreak(4, 'neutral')).toBe(4);
  });

  it('never earns a fourth stone (cap at 3)', () => {
    expect(earnsStone({ streakBefore: 20, streakAfter: 21, held: 2, mode: 'standard' })).toBe(true);
    expect(earnsStone({ streakBefore: 20, streakAfter: 21, held: 3, mode: 'standard' })).toBe(
      false,
    );
  });

  it('pays only when a close moves the streak onto the multiple', () => {
    expect(earnsStone({ streakBefore: 7, streakAfter: 7, held: 0, mode: 'standard' })).toBe(false);
    expect(earnsStone({ streakBefore: 6, streakAfter: 7, held: 0, mode: 'hardcore' })).toBe(false);
  });

  it('freezes held stones in Hardcore', () => {
    expect(canSpendStone(2, 'hardcore')).toBe(false);
    expect(canSpendStone(2, 'standard')).toBe(true);
    expect(canSpendStone(0, 'lenient')).toBe(false);
  });

  it('derives the held count from +1 / -1 events', () => {
    expect(stonesHeld([1, 1, -1, 1])).toBe(2);
    expect(stonesHeld([])).toBe(0);
  });
});
