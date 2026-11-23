import { describe, expect, it } from 'vitest';
import type { ExerciseKind, StatId } from './config';
import {
  bossReward,
  canHaveBoss,
  defeatsBoss,
  detectPrs,
  e1rmCentiKg,
  kindForLibraryCategory,
  payablePrBonuses,
  toCentiKg,
  workoutSetXp,
  type LoggedSet,
  type WorkoutSetInput,
} from './gym';
import { adjustRestSeconds, clampRestSeconds, restTimerState } from './restTimer';
import vectors from './testdata/gym-vectors.json';

/**
 * TypeScript half of the gym parity suites (4.3 - 4.5). The SQL half is
 * generated from the same JSON when the SQL lands (2.6).
 */
describe('e1RM vectors (Epley, centi-kg, half up)', () => {
  it.each(vectors.e1rm)('$note', (vector) => {
    expect(e1rmCentiKg(vector.weightCentiKg, vector.reps)).toBe(vector.expected);
  });
});

describe('PR detection vectors', () => {
  it.each(vectors.prs)('$note', (vector) => {
    expect(
      detectPrs({
        kind: vector.kind as ExerciseKind,
        prior: vector.prior,
        sets: vector.sets as LoggedSet[],
      }),
    ).toEqual(vector.expected);
  });

  it.each(vectors.payableBonuses)(
    '$candidates candidates after $alreadyPaidToday paid -> $expected',
    (vector) => {
      expect(payablePrBonuses(vector.candidates, vector.alreadyPaidToday)).toBe(vector.expected);
    },
  );
});

const KIND_LETTERS: Record<string, ExerciseKind> = { S: 'strength', C: 'cardio', M: 'mobility' };

function parseSets(notation: string): WorkoutSetInput[] {
  return notation.split(' ').map((token) => ({
    setType: token[0] === 'w' ? 'warmup' : 'working',
    kind: KIND_LETTERS[token[1]!]!,
  }));
}

describe('set XP vectors (4.3)', () => {
  it.each(vectors.setXp)('$note', (vector) => {
    const result = workoutSetXp(parseSets(vector.sets), vector.countedToday);
    expect(result).toEqual({
      countedSets: vector.expected.countedSets,
      fullXp: vector.expected.fullXp,
      stats: vector.expected.stats as { stat: StatId; weight: number }[],
    });
  });
});

describe('boss vectors (4.5)', () => {
  it.each(vectors.bosses)('$note', (vector) => {
    expect(
      defeatsBoss(
        vector.boss as { kind: ExerciseKind; targetWeightKg: number; targetReps: number },
        vector.set as LoggedSet,
      ),
    ).toBe(vector.expected);
  });

  it('pays twice the difficulty XP and a free point', () => {
    expect(bossReward('B')).toEqual({ xp: 100, freePoints: 1 });
    expect(bossReward('S')).toEqual({ xp: 200, freePoints: 1 });
  });

  it('exists only for strength exercises', () => {
    expect(canHaveBoss('strength')).toBe(true);
    expect(canHaveBoss('cardio')).toBe(false);
    expect(canHaveBoss('mobility')).toBe(false);
    expect(
      defeatsBoss(
        { kind: 'cardio', targetWeightKg: 10, targetReps: 1 },
        { setType: 'working', reps: 5, weightKg: 20 },
      ),
    ).toBe(false);
  });
});

describe('exercise kinds (4.1, step 0 G-i)', () => {
  it('maps every library category', () => {
    expect(kindForLibraryCategory('strength')).toBe('strength');
    expect(kindForLibraryCategory('olympic weightlifting')).toBe('strength');
    expect(kindForLibraryCategory('plyometrics')).toBe('cardio');
    expect(kindForLibraryCategory('stretching')).toBe('mobility');
  });

  it('fails loudly on a category it does not know', () => {
    expect(() => kindForLibraryCategory('yoga')).toThrow(RangeError);
  });
});

describe('weights', () => {
  it('converts kg with two decimals to centi-kg exactly', () => {
    expect(toCentiKg(92.5)).toBe(9250);
    expect(toCentiKg(0.15)).toBe(15);
    expect(toCentiKg(1000)).toBe(100000);
    expect(() => toCentiKg(1.005)).toThrow(RangeError);
  });
});

describe('rest timer (4.6)', () => {
  it('clamps and steps by 15 s', () => {
    expect(clampRestSeconds(5)).toBe(15);
    expect(clampRestSeconds(9999)).toBe(600);
    expect(adjustRestSeconds(90, 1)).toBe(105);
    expect(adjustRestSeconds(90, -1)).toBe(75);
    expect(adjustRestSeconds(15, -1)).toBe(15);
  });

  it('counts down from a persisted start and finishes once', () => {
    const start = Date.parse('2026-12-08T18:00:00Z');
    expect(restTimerState(start, 90, start)).toEqual({ remainingMs: 90_000, finished: false });
    expect(restTimerState(start, 90, start + 89_500)).toEqual({
      remainingMs: 500,
      finished: false,
    });
    expect(restTimerState(start, 90, start + 120_000)).toEqual({ remainingMs: 0, finished: true });
  });
});
