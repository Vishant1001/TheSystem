import { describe, expect, it } from 'vitest';
import { deriveHunterState, detectLevelUp, type HunterSnapshot } from './derive';
import { emptyStatRecord } from './stats';
import { totalXpForLevel } from './levels';

function snapshot(overrides: Partial<HunterSnapshot> = {}): HunterSnapshot {
  return {
    totalXp: 0,
    statXp: emptyStatRecord(),
    freePointsFromEvents: 0,
    allocatedPoints: emptyStatRecord(),
    ...overrides,
  };
}

describe('deriveHunterState', () => {
  it('describes a brand new hunter (acceptance 1.4)', () => {
    const state = deriveHunterState(snapshot());
    expect(state.level).toBe(1);
    expect(state.rank).toBe('E');
    expect(state.totalXp).toBe(0);
    expect(state.freePointsAvailable).toBe(0);
    expect(state.stats).toHaveLength(5);
    for (const stat of state.stats) {
      expect(stat.value).toBe(10);
      expect(stat.autoValue).toBe(10);
      expect(stat.allocated).toBe(0);
      expect(stat.xpForNext).toBe(30);
    }
  });

  it('derives level, rank, stats and points together', () => {
    const state = deriveHunterState(
      snapshot({
        totalXp: totalXpForLevel(10),
        statXp: { ...emptyStatRecord(), STR: 63, INT: 30 },
        freePointsFromEvents: 4,
        allocatedPoints: { ...emptyStatRecord(), STR: 2 },
      }),
    );

    expect(state.level).toBe(10);
    expect(state.rank).toBe('D');
    expect(state.xpIntoLevel).toBe(0);

    const str = state.stats.find((stat) => stat.id === 'STR');
    expect(str?.autoValue).toBe(12);
    expect(str?.allocated).toBe(2);
    expect(str?.value).toBe(14);

    const int = state.stats.find((stat) => stat.id === 'INT');
    expect(int?.value).toBe(11);

    // 3 per level for 9 levels gained, plus 4 daily-clear points, minus 2 spent.
    expect(state.freePointsEarned).toBe(31);
    expect(state.allocatedTotal).toBe(2);
    expect(state.freePointsAvailable).toBe(29);
  });

  it('keeps a reversed ledger from pushing anything negative', () => {
    const state = deriveHunterState(
      snapshot({ totalXp: -120, statXp: { ...emptyStatRecord(), VIT: -40 } }),
    );
    expect(state.level).toBe(1);
    expect(state.totalXp).toBe(0);
    expect(state.stats.find((stat) => stat.id === 'VIT')?.value).toBe(10);
  });
});

describe('detectLevelUp', () => {
  it('reports no level up when the level is unchanged (7.4)', () => {
    expect(detectLevelUp({ level: 4 }, { level: 4 })).toMatchObject({
      leveledUp: false,
      rankChanged: false,
    });
  });

  it('reports the final level when several thresholds are crossed at once (7.3)', () => {
    expect(detectLevelUp({ level: 2 }, { level: 5 })).toMatchObject({
      leveledUp: true,
      fromLevel: 2,
      toLevel: 5,
      rankChanged: false,
    });
  });

  it('flags a rank change', () => {
    expect(detectLevelUp({ level: 9 }, { level: 10 })).toMatchObject({
      leveledUp: true,
      rankChanged: true,
    });
  });
});
