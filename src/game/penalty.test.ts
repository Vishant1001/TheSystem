import { describe, expect, it } from 'vitest';
import { computeAward } from './award';
import { levelFromTotalXp, totalXpForLevel, xpToNext } from './levels';
import {
  PENALTY_STATES,
  allowedChoices,
  canTransition,
  debtAmount,
  debtRemaining,
  debtRepayment,
  initialPenalty,
  isOpenPenalty,
  isTrialOpen,
  isWeakenedOn,
  onFailedDay,
  onTrialExpired,
  trialCategory,
  trialDeadline,
  trialTemplate,
  weakenedStat,
  weakenedWindow,
  type OpenPenalty,
  type PenaltyState,
} from './penalty';
import debtVectors from './testdata/debt-vectors.json';
import penaltyVectors from './testdata/penalty-vectors.json';
import type { Category, StatId } from './config';

describe('penalty state machine (section 5, amended: no expired)', () => {
  it('has exactly the agreed states', () => {
    expect(PENALTY_STATES).toEqual([
      'pending_choice',
      'trial_active',
      'debt_active',
      'weakened_active',
      'cleared',
      'redeemed',
    ]);
  });

  it('allows the agreed transitions and nothing else', () => {
    const allowed = new Set([
      'pending_choice>trial_active',
      'pending_choice>debt_active',
      'pending_choice>weakened_active',
      'pending_choice>redeemed',
      'trial_active>cleared',
      'trial_active>debt_active',
      'trial_active>redeemed',
      'debt_active>cleared',
      'debt_active>redeemed',
      'weakened_active>cleared',
      'weakened_active>redeemed',
      'cleared>debt_active',
    ]);
    for (const from of PENALTY_STATES) {
      for (const to of PENALTY_STATES) {
        expect(canTransition(from, to, 'debt')).toBe(allowed.has(`${from}>${to}`));
      }
    }
  });

  it('reopens only a cleared debt', () => {
    expect(canTransition('cleared', 'debt_active', 'debt')).toBe(true);
    expect(canTransition('cleared', 'debt_active', 'trial')).toBe(false);
    expect(canTransition('cleared', 'debt_active', 'weakened')).toBe(false);
  });

  it('treats only the four active states as open', () => {
    expect(PENALTY_STATES.filter(isOpenPenalty)).toEqual([
      'pending_choice',
      'trial_active',
      'debt_active',
      'weakened_active',
    ]);
  });
});

describe('penalty creation per mode (3.1, 3.3)', () => {
  it('Standard pends a choice of three', () => {
    expect(initialPenalty('standard')).toEqual({
      state: 'pending_choice',
      choice: null,
      debtRatePercent: null,
    });
    expect(allowedChoices('standard')).toEqual(['trial', 'debt', 'weakened']);
  });

  it('Lenient applies a 10% debt with no choice', () => {
    expect(initialPenalty('lenient')).toEqual({
      state: 'debt_active',
      choice: 'debt',
      debtRatePercent: 10,
    });
    expect(allowedChoices('lenient')).toEqual([]);
  });

  it('Hardcore is a Survival Trial only', () => {
    expect(initialPenalty('hardcore')).toEqual({
      state: 'trial_active',
      choice: 'trial',
      debtRatePercent: null,
    });
    expect(allowedChoices('hardcore')).toEqual([]);
  });
});

describe('the one-open-penalty rule (3.3)', () => {
  function apply(open: OpenPenalty | null, mode: 'standard' | 'lenient' | 'hardcore') {
    const action = onFailedDay(open, mode);
    if (action.action === 'create') return { state: action.penalty.state, escalated: false };
    if (action.action === 'escalate')
      return { state: 'debt_active' as PenaltyState, escalated: true };
    return open;
  }

  it('creates one penalty and escalates it once across 5 consecutive failures', () => {
    for (const mode of ['standard', 'hardcore'] as const) {
      let open: OpenPenalty | null = null;
      const actions: string[] = [];
      for (let day = 0; day < 5; day += 1) {
        actions.push(onFailedDay(open, mode).action);
        open = apply(open, mode);
      }
      expect(actions).toEqual(['create', 'escalate', 'none', 'none', 'none']);
      expect(open).toEqual({ state: 'debt_active', escalated: true });
    }
  });

  it('never escalates a Lenient debt: it is already a debt', () => {
    let open: OpenPenalty | null = null;
    const actions: string[] = [];
    for (let day = 0; day < 5; day += 1) {
      actions.push(onFailedDay(open, 'lenient').action);
      open = apply(open, 'lenient');
    }
    expect(actions).toEqual(['create', 'none', 'none', 'none', 'none']);
  });

  it('escalates to the 30% rate', () => {
    expect(onFailedDay({ state: 'pending_choice', escalated: false }, 'standard')).toEqual({
      action: 'escalate',
      debtRatePercent: 30,
    });
    expect(onTrialExpired()).toEqual({ action: 'escalate', debtRatePercent: 30 });
  });

  it('records nothing against a chosen debt or an active Weakened', () => {
    expect(onFailedDay({ state: 'debt_active', escalated: false }, 'standard').action).toBe('none');
    expect(onFailedDay({ state: 'weakened_active', escalated: false }, 'standard').action).toBe(
      'none',
    );
  });

  it('starts fresh once the previous penalty is closed', () => {
    expect(onFailedDay({ state: 'cleared', escalated: true }, 'standard').action).toBe('create');
    expect(onFailedDay({ state: 'redeemed', escalated: false }, 'standard').action).toBe('create');
  });
});

describe('penalty selection rules (3.4)', () => {
  it('picks the most common missed category', () => {
    expect(
      trialCategory([
        { category: 'life', statTags: ['INT'] },
        { category: 'diet', statTags: ['VIT'] },
        { category: 'life', statTags: ['SENSE'] },
      ]),
    ).toBe('life');
  });

  it('breaks category ties in the order fitness, diet, life', () => {
    expect(
      trialCategory([
        { category: 'life', statTags: ['INT'] },
        { category: 'diet', statTags: ['VIT'] },
      ]),
    ).toBe('diet');
    expect(
      trialCategory([
        { category: 'life', statTags: ['INT'] },
        { category: 'fitness', statTags: ['STR'] },
        { category: 'diet', statTags: ['VIT'] },
      ]),
    ).toBe('fitness');
  });

  it('picks the most tagged stat, counting every tag', () => {
    expect(
      weakenedStat([
        { category: 'fitness', statTags: ['STR', 'VIT'] },
        { category: 'diet', statTags: ['VIT'] },
      ]),
    ).toBe('VIT');
  });

  it('breaks stat ties in the order STR, AGI, VIT, INT, SENSE', () => {
    expect(
      weakenedStat([
        { category: 'life', statTags: ['SENSE', 'INT'] },
        { category: 'diet', statTags: ['VIT'] },
      ]),
    ).toBe('VIT');
    expect(
      weakenedStat([
        { category: 'fitness', statTags: ['AGI'] },
        { category: 'fitness', statTags: ['STR'] },
      ]),
    ).toBe('STR');
  });

  it('refuses an empty miss list', () => {
    expect(() => trialCategory([])).toThrow(RangeError);
    expect(() => weakenedStat([])).toThrow(RangeError);
  });

  it('builds the trial from the category template', () => {
    expect(trialTemplate('diet')).toMatchObject({
      goalType: 'count',
      target: 3,
      tracking: 'auto_food_count',
    });
    expect(trialTemplate('fitness')).toMatchObject({ title: 'Survival circuit', target: 15 });
  });

  it('sets the deadline 24 hours after the choice and refuses from it on', () => {
    const chosenAt = new Date('2026-12-08T07:15:00Z');
    const deadline = trialDeadline(chosenAt);
    expect(deadline.toISOString()).toBe('2026-12-09T07:15:00.000Z');
    expect(isTrialOpen(new Date('2026-12-09T07:14:59Z'), deadline)).toBe(true);
    expect(isTrialOpen(deadline, deadline)).toBe(false);
  });

  it('keeps Weakened for the choice day and the next', () => {
    const window = weakenedWindow('2026-12-08');
    expect(window).toEqual({ from: '2026-12-08', until: '2026-12-09' });
    expect(isWeakenedOn('2026-12-07', window)).toBe(false);
    expect(isWeakenedOn('2026-12-08', window)).toBe(true);
    expect(isWeakenedOn('2026-12-09', window)).toBe(true);
    expect(isWeakenedOn('2026-12-10', window)).toBe(false);
  });
});

describe('debt parity vectors (3.4)', () => {
  it.each(debtVectors.amount)('amount: $note', (vector) => {
    expect(debtAmount(vector.ratePercent, vector.level)).toBe(vector.expected);
  });

  it.each(debtVectors.repayment)('repayment: $note', (vector) => {
    expect(debtRepayment(vector.awardXp, vector.remaining)).toBe(vector.expected);
  });

  it('uses the last real step at the max level', () => {
    expect(debtAmount(20, 999)).toBe(Math.round(0.2 * xpToNext(998)));
  });
});

describe('derived debt remaining (ADR-1)', () => {
  it('subtracts repayments and adds back their reversals', () => {
    expect(debtRemaining(70, [])).toBe(70);
    expect(debtRemaining(70, [-17, -25])).toBe(28);
    // A reversed award reverses its repayment: the debt reopens.
    expect(debtRemaining(70, [-17, -25, -28])).toBe(0);
    expect(debtRemaining(70, [-17, -25, -28, 28])).toBe(28);
  });
});

describe('a hunter can never lose a level under debt (3.4)', () => {
  it('holds for every award sequence at every debt size', () => {
    const sources = ['quest', 'workout', 'pr'] as const;
    const amounts = [0, 1, 10, 20, 35, 50, 75, 100];
    for (const startLevel of [1, 2, 9, 30, 60]) {
      for (const rate of [10, 20, 30]) {
        let total = totalXpForLevel(startLevel);
        const amount = debtAmount(rate, startLevel);
        const repayments: number[] = [];
        let lowest = levelFromTotalXp(total).level;
        for (let step = 0; step < 60; step += 1) {
          const source = sources[step % sources.length]!;
          const fullXp = amounts[(step * 7) % amounts.length]!;
          const award = computeAward({
            source,
            fullXp,
            capRoom: 150,
            stats: [{ stat: 'STR', weight: 1 }],
            weakenedStat: null,
            debtRemaining: debtRemaining(amount, repayments),
          });
          const before = levelFromTotalXp(total).level;
          total += award.xp - award.repayment;
          repayments.push(-award.repayment);
          const after = levelFromTotalXp(total).level;
          expect(after).toBeGreaterThanOrEqual(before);
          lowest = Math.min(lowest, after);
        }
        expect(lowest).toBe(startLevel);
        expect(debtRemaining(amount, repayments)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('never repays more than the award itself', () => {
    for (let xp = 0; xp <= 200; xp += 1) {
      for (const remaining of [0, 1, 7, 50, 10_000]) {
        const repayment = debtRepayment(xp, remaining);
        expect(repayment).toBeLessThanOrEqual(xp);
        expect(xp - repayment).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('penalty parity vectors (SQL half: penalty_parity.sql)', () => {
  it.each(penaltyVectors.trialCategory)('trial category: $note', (vector) => {
    expect(
      trialCategory(
        vector.missed.map((category) => ({ category: category as Category, statTags: [] })),
      ),
    ).toBe(vector.expected);
  });

  it.each(penaltyVectors.weakenedStat)('weakened stat: $note', (vector) => {
    expect(
      weakenedStat(
        vector.tags.map((statTags) => ({ category: 'life', statTags: statTags as StatId[] })),
      ),
    ).toBe(vector.expected);
  });

  it.each(penaltyVectors.failedDay)('failed day: $note', (vector) => {
    const action = onFailedDay(
      vector.open as OpenPenalty | null,
      vector.mode as 'lenient' | 'standard' | 'hardcore',
    );
    const actual =
      action.action === 'create'
        ? {
            action: 'create',
            state: action.penalty.state,
            debtRatePercent: action.penalty.debtRatePercent,
          }
        : action.action === 'escalate'
          ? { action: 'escalate', state: 'debt_active', debtRatePercent: action.debtRatePercent }
          : { action: 'none', state: null, debtRatePercent: null };
    expect(actual).toEqual(vector.expected);
  });

  it('transitions: the allowed list is exactly canTransition', () => {
    const allowed = new Set(penaltyVectors.transitions.allowed);
    for (const from of PENALTY_STATES) {
      for (const to of PENALTY_STATES) {
        const key = `${from}>${to}`;
        expect(canTransition(from, to, 'debt')).toBe(allowed.has(key));
        if (key === penaltyVectors.transitions.reopenNeedsDebt) {
          expect(canTransition(from, to, 'trial')).toBe(false);
        }
      }
    }
  });
});
