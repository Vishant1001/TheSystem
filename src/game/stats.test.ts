import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from './config';
import { displayedStatValue, statFromStatXp, statXpToNext, totalStatXpForValue } from './stats';

const { startValue } = GAME_CONFIG.stats;

/** Deliberately naive walk, used to cross-check the closed-form solution. */
function naiveStatFromStatXp(totalStatXp: number): { autoValue: number; xpIntoPoint: number } {
  let value = startValue;
  let remaining = Math.max(0, Math.floor(totalStatXp));
  for (;;) {
    const needed = statXpToNext(value);
    if (remaining < needed) return { autoValue: value, xpIntoPoint: remaining };
    remaining -= needed;
    value += 1;
  }
}

describe('statXpToNext', () => {
  it('matches the curve from the brief (5.3)', () => {
    expect(statXpToNext(10)).toBe(30);
    expect(statXpToNext(11)).toBe(33);
    expect(statXpToNext(20)).toBe(60);
  });

  it('rejects values below the starting value', () => {
    expect(() => statXpToNext(9)).toThrow(RangeError);
    expect(() => statXpToNext(10.5)).toThrow(RangeError);
  });
});

describe('totalStatXpForValue', () => {
  it('accumulates the curve', () => {
    expect(totalStatXpForValue(10)).toBe(0);
    expect(totalStatXpForValue(11)).toBe(30);
    expect(totalStatXpForValue(12)).toBe(63);
    expect(totalStatXpForValue(13)).toBe(99);
  });
});

describe('statFromStatXp', () => {
  it('starts every stat at 10 (5.3)', () => {
    expect(statFromStatXp(0)).toEqual({
      autoValue: 10,
      xpIntoPoint: 0,
      xpForNext: 30,
      totalStatXp: 0,
    });
  });

  it('holds the value one XP short and grows exactly on the threshold', () => {
    expect(statFromStatXp(29).autoValue).toBe(10);
    expect(statFromStatXp(29).xpIntoPoint).toBe(29);
    expect(statFromStatXp(30).autoValue).toBe(11);
    expect(statFromStatXp(30).xpIntoPoint).toBe(0);
    expect(statFromStatXp(30).xpForNext).toBe(33);
    expect(statFromStatXp(63).autoValue).toBe(12);
  });

  it('clamps negative stat XP', () => {
    expect(statFromStatXp(-250).autoValue).toBe(10);
    expect(statFromStatXp(-250).totalStatXp).toBe(0);
  });

  it('property: the closed form agrees with a naive walk', () => {
    for (let xp = 0; xp <= 20000; xp += 13) {
      const fast = statFromStatXp(xp);
      const slow = naiveStatFromStatXp(xp);
      expect(fast.autoValue).toBe(slow.autoValue);
      expect(fast.xpIntoPoint).toBe(slow.xpIntoPoint);
    }
  });

  it('property: exact boundaries never land one point early or late', () => {
    for (let value = startValue; value < 300; value += 1) {
      const exact = totalStatXpForValue(value);
      expect(statFromStatXp(exact).autoValue).toBe(value);
      expect(statFromStatXp(exact).xpIntoPoint).toBe(0);
      if (value > startValue) expect(statFromStatXp(exact - 1).autoValue).toBe(value - 1);
    }
  });
});

describe('displayedStatValue', () => {
  it('adds allocated points to the auto value (5.3)', () => {
    expect(displayedStatValue(63, 0)).toBe(12);
    expect(displayedStatValue(63, 5)).toBe(17);
  });

  it('allocated points never change the cost of the next auto point (5.3)', () => {
    const withoutAllocation = statFromStatXp(63);
    expect(displayedStatValue(63, 9)).toBe(withoutAllocation.autoValue + 9);
    // The curve is read from the auto value alone, so the next point costs what
    // it costs at auto value 12, not at displayed value 21.
    expect(withoutAllocation.xpForNext).toBe(statXpToNext(12));
    expect(withoutAllocation.xpForNext).not.toBe(statXpToNext(21));
  });
});
