import { describe, expect, it } from 'vitest';
import { capRoom, computeAward, splitByWeight, type AwardInput } from './award';
import { DIFFICULTIES, GAME_CONFIG, type AwardSource, type StatId } from './config';
import { computeQuestAward } from './rewards';
import { emptyStatRecord } from './stats';
import vectors from './testdata/award-vectors.json';

/**
 * TypeScript half of the award pipeline parity suite (brief section 6). The
 * SQL half is generated from the same JSON when the SQL pipeline lands (2.3).
 */
describe('award pipeline vectors', () => {
  it.each(vectors)('$note', (vector) => {
    const input = vector.input as AwardInput & { source: AwardSource };
    const award = computeAward(input);
    expect(award).toEqual({
      xp: vector.expected.xp,
      fullXp: input.fullXp,
      capped: vector.expected.capped,
      statXp: {
        ...emptyStatRecord(),
        ...(vector.expected.statXp as Partial<Record<StatId, number>>),
      },
      weakened: vector.expected.weakened,
      repayment: vector.expected.repayment,
    });
  });

  it('covers every award source', () => {
    const sources = new Set(vectors.map((vector) => vector.input.source));
    expect([...sources].sort()).toEqual(['boss', 'daily_clear', 'pr', 'quest', 'trial', 'workout']);
  });
});

describe('the quest path is unchanged from Phase 1', () => {
  it('matches computeQuestAward for every difficulty and cap room', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const categoryXpToday of [0, 25, 100, 140, 149, 150, 200]) {
        for (const statTags of [['STR'], ['VIT', 'INT']] as StatId[][]) {
          const phase1 = computeQuestAward({
            difficulty,
            category: 'fitness',
            statTags,
            categoryXpToday,
          });
          const award = computeAward({
            source: 'quest',
            fullXp: GAME_CONFIG.rewards.xpByDifficulty[difficulty],
            capRoom: capRoom(GAME_CONFIG.dailyCaps.fitness, categoryXpToday),
            stats: statTags.map((stat) => ({ stat, weight: 1 })),
            weakenedStat: null,
            debtRemaining: 0,
          });
          expect({ xp: award.xp, capped: award.capped, statXp: award.statXp }).toEqual({
            xp: phase1.xp,
            capped: phase1.capped,
            statXp: phase1.statXp,
          });
        }
      }
    }
  });
});

describe('every source through every modifier', () => {
  const sources = Object.keys(GAME_CONFIG.awardSources) as AwardSource[];

  it('applies the cap, Weakened and debt exactly per source rule', () => {
    for (const source of sources) {
      const rule = GAME_CONFIG.awardSources[source];
      for (const room of [0, 5, 500]) {
        for (const weakenedStat of [null, 'STR', 'INT'] as (StatId | null)[]) {
          for (const debt of [0, 3, 1000]) {
            const fullXp = source === 'daily_clear' ? 0 : 40;
            const award = computeAward({
              source,
              fullXp,
              capRoom: room,
              stats: source === 'daily_clear' ? [] : [{ stat: 'STR', weight: 1 }],
              weakenedStat,
              debtRemaining: debt,
            });
            expect(award.xp).toBe(rule.capped ? Math.min(fullXp, room) : fullXp);
            if (weakenedStat === 'STR') expect(award.statXp.STR).toBe(0);
            if (!rule.repaysDebt || debt === 0) expect(award.repayment).toBe(0);
            else expect(award.repayment).toBe(Math.min(Math.floor(award.xp / 2), debt));
          }
        }
      }
    }
  });
});

describe('splitByWeight', () => {
  it('reproduces the G1 even split for equal weights', () => {
    const split = splitByWeight(17, [
      { stat: 'STR', weight: 1 },
      { stat: 'VIT', weight: 1 },
    ]);
    expect(split.STR).toBe(9);
    expect(split.VIT).toBe(8);
  });

  it('never loses stat XP', () => {
    for (let total = 0; total < 60; total += 1) {
      const split = splitByWeight(total, [
        { stat: 'STR', weight: 5 },
        { stat: 'AGI', weight: 3 },
        { stat: 'VIT', weight: 1 },
      ]);
      expect(split.STR + split.AGI + split.VIT).toBe(total);
    }
  });

  it('rejects duplicate stats and bad weights', () => {
    expect(() =>
      splitByWeight(4, [
        { stat: 'STR', weight: 1 },
        { stat: 'STR', weight: 1 },
      ]),
    ).toThrow(RangeError);
    expect(() => splitByWeight(4, [{ stat: 'STR', weight: 0 }])).toThrow(RangeError);
  });
});
