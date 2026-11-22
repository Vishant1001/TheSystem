import { describe, expect, it } from 'vitest';
import { baseStatXp, computeQuestAward, dailyCap, questXp, splitStatXp } from './rewards';

describe('questXp', () => {
  it('matches the reward table (5.5)', () => {
    expect(questXp('E')).toBe(10);
    expect(questXp('D')).toBe(20);
    expect(questXp('C')).toBe(35);
    expect(questXp('B')).toBe(50);
    expect(questXp('A')).toBe(75);
    expect(questXp('S')).toBe(100);
  });
});

describe('dailyCap', () => {
  it('matches the cap table (5.6)', () => {
    expect(dailyCap('fitness')).toBe(150);
    expect(dailyCap('diet')).toBe(100);
    expect(dailyCap('life')).toBe(150);
  });
});

describe('baseStatXp', () => {
  it('is floor(XP / 2) (5.5)', () => {
    expect(baseStatXp(35)).toBe(17);
    expect(baseStatXp(10)).toBe(5);
    expect(baseStatXp(0)).toBe(0);
  });
});

describe('splitStatXp', () => {
  it('gives everything to a single tag', () => {
    expect(splitStatXp(17, ['INT'], { applyMinimum: true })).toEqual({
      STR: 0,
      AGI: 0,
      VIT: 0,
      INT: 17,
      SENSE: 0,
    });
  });

  it('floors the split and gives the remainder to the first tag (G1)', () => {
    const split = splitStatXp(17, ['STR', 'VIT'], { applyMinimum: true });
    expect(split.STR).toBe(9);
    expect(split.VIT).toBe(8);
    expect(split.STR + split.VIT).toBe(17);
  });

  it('loses nothing on any total', () => {
    for (let total = 0; total <= 200; total += 1) {
      const split = splitStatXp(total, ['AGI', 'SENSE'], { applyMinimum: false });
      expect(split.AGI + split.SENSE).toBe(total);
    }
  });

  it('applies the minimum of 1 per tag only when asked (G2)', () => {
    expect(splitStatXp(1, ['STR', 'VIT'], { applyMinimum: true })).toMatchObject({
      STR: 1,
      VIT: 1,
    });
    expect(splitStatXp(1, ['STR', 'VIT'], { applyMinimum: false })).toMatchObject({
      STR: 1,
      VIT: 0,
    });
    expect(splitStatXp(0, ['STR', 'VIT'], { applyMinimum: false })).toMatchObject({
      STR: 0,
      VIT: 0,
    });
  });

  it('rejects malformed tag lists', () => {
    expect(() => splitStatXp(10, [], { applyMinimum: true })).toThrow(RangeError);
    expect(() => splitStatXp(10, ['STR', 'VIT', 'INT'], { applyMinimum: true })).toThrow(
      RangeError,
    );
    expect(() => splitStatXp(10, ['STR', 'STR'], { applyMinimum: true })).toThrow(RangeError);
  });
});

describe('computeQuestAward', () => {
  it('awards a full manual quest (acceptance 1.5: Study)', () => {
    const award = computeQuestAward({
      difficulty: 'C',
      category: 'life',
      statTags: ['INT'],
      categoryXpToday: 0,
    });
    expect(award.xp).toBe(35);
    expect(award.capped).toBe(false);
    expect(award.statXp.INT).toBe(17);
  });

  it('splits a two-tag quest with the remainder on the first tag (Train)', () => {
    const award = computeQuestAward({
      difficulty: 'C',
      category: 'fitness',
      statTags: ['STR', 'VIT'],
      categoryXpToday: 0,
    });
    expect(award.xp).toBe(35);
    expect(award.statXp.STR).toBe(9);
    expect(award.statXp.VIT).toBe(8);
  });

  it('awards only the remaining cap room and scales stat XP by the same ratio (5.6)', () => {
    const award = computeQuestAward({
      difficulty: 'S',
      category: 'life',
      statTags: ['INT'],
      categoryXpToday: 130,
    });
    expect(award.xp).toBe(20);
    expect(award.fullXp).toBe(100);
    expect(award.capped).toBe(true);
    expect(award.capRemainingBefore).toBe(20);
    // floor(50 * 20 / 100)
    expect(award.statXp.INT).toBe(10);
  });

  it('scales a capped two-tag award and still loses nothing in the split', () => {
    const award = computeQuestAward({
      difficulty: 'S',
      category: 'fitness',
      statTags: ['STR', 'AGI'],
      categoryXpToday: 125,
    });
    expect(award.xp).toBe(25);
    // floor(50 * 25 / 100) = 12 -> 6 / 6
    expect(award.statXp.STR).toBe(6);
    expect(award.statXp.AGI).toBe(6);
    expect(award.statXp.STR + award.statXp.AGI).toBe(12);
  });

  it('records a zero-XP capped award when the cap is exhausted (5.6, G2)', () => {
    const award = computeQuestAward({
      difficulty: 'S',
      category: 'diet',
      statTags: ['VIT', 'STR'],
      categoryXpToday: 100,
    });
    expect(award.xp).toBe(0);
    expect(award.capped).toBe(true);
    expect(award.capRemainingBefore).toBe(0);
    expect(award.statXp.VIT).toBe(0);
    expect(award.statXp.STR).toBe(0);
  });

  it('treats an over-cap day as having no room left', () => {
    const award = computeQuestAward({
      difficulty: 'E',
      category: 'diet',
      statTags: ['VIT'],
      categoryXpToday: 250,
    });
    expect(award.xp).toBe(0);
    expect(award.capped).toBe(true);
  });

  it('clamps a negative day total instead of inventing cap room', () => {
    const award = computeQuestAward({
      difficulty: 'E',
      category: 'diet',
      statTags: ['VIT'],
      categoryXpToday: -40,
    });
    expect(award.capRemainingBefore).toBe(100);
    expect(award.xp).toBe(10);
    expect(award.capped).toBe(false);
  });

  it('never awards more than the cap across a sequence of quests', () => {
    let dayTotal = 0;
    for (let i = 0; i < 10; i += 1) {
      const award = computeQuestAward({
        difficulty: 'A',
        category: 'life',
        statTags: ['INT', 'SENSE'],
        categoryXpToday: dayTotal,
      });
      dayTotal += award.xp;
    }
    expect(dayTotal).toBe(dailyCap('life'));
  });
});
