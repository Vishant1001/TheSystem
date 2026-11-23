import {
  GAME_CONFIG,
  type Category,
  type GameConfig,
  type PenaltyMode,
  type StatId,
} from './config';
import { addDays } from './dates';
import { xpToNext } from './levels';

/**
 * Brief 3.3 - 3.5 and the state machine in section 5 (amended at step 0:
 * there is no `expired` state).
 *
 *   pending_choice -> trial_active | debt_active | weakened_active | redeemed
 *   trial_active   -> cleared | debt_active (escalated) | redeemed
 *   debt_active    -> cleared | redeemed
 *   weakened_active-> cleared | redeemed
 *   cleared        -> debt_active   (only a debt, when a reversal reopens it)
 */
export const PENALTY_STATES = [
  'pending_choice',
  'trial_active',
  'debt_active',
  'weakened_active',
  'cleared',
  'redeemed',
] as const;
export type PenaltyState = (typeof PENALTY_STATES)[number];

export const PENALTY_CHOICES = ['trial', 'debt', 'weakened'] as const;
export type PenaltyChoice = (typeof PENALTY_CHOICES)[number];

const OPEN_STATES: readonly PenaltyState[] = [
  'pending_choice',
  'trial_active',
  'debt_active',
  'weakened_active',
];

export function isOpenPenalty(state: PenaltyState): boolean {
  return OPEN_STATES.includes(state);
}

const TRANSITIONS: Record<PenaltyState, readonly PenaltyState[]> = {
  pending_choice: ['trial_active', 'debt_active', 'weakened_active', 'redeemed'],
  trial_active: ['cleared', 'debt_active', 'redeemed'],
  debt_active: ['cleared', 'redeemed'],
  weakened_active: ['cleared', 'redeemed'],
  cleared: ['debt_active'],
  redeemed: [],
};

/**
 * `choice` is the penalty's current form (null while pending). Reopening a
 * cleared penalty is only possible for a debt.
 */
export function canTransition(
  from: PenaltyState,
  to: PenaltyState,
  choice: PenaltyChoice | null,
): boolean {
  if (!TRANSITIONS[from].includes(to)) return false;
  if (from === 'cleared') return choice === 'debt';
  return true;
}

/** The choices a pending penalty offers. Lenient and Hardcore never pend. */
export function allowedChoices(mode: PenaltyMode): readonly PenaltyChoice[] {
  return mode === 'standard' ? PENALTY_CHOICES : [];
}

export interface PenaltyCreation {
  state: PenaltyState;
  choice: PenaltyChoice | null;
  /** Set when the penalty starts as a debt (Lenient). */
  debtRatePercent: number | null;
}

/** Brief 3.3: what a fresh penalty looks like in each mode. */
export function initialPenalty(
  mode: PenaltyMode,
  config: GameConfig = GAME_CONFIG,
): PenaltyCreation {
  if (mode === 'lenient') {
    return {
      state: 'debt_active',
      choice: 'debt',
      debtRatePercent: config.penalty.debtRatePercent.lenient,
    };
  }
  if (mode === 'hardcore') return { state: 'trial_active', choice: 'trial', debtRatePercent: null };
  return { state: 'pending_choice', choice: null, debtRatePercent: null };
}

export interface OpenPenalty {
  state: PenaltyState;
  escalated: boolean;
}

export type FailedDayAction =
  | { action: 'create'; penalty: PenaltyCreation }
  | { action: 'escalate'; debtRatePercent: number }
  | { action: 'none' };

/**
 * Brief 3.3: one open penalty at most. A failure while one is open escalates
 * it once (pending or trial -> 30% debt); after that, or against a debt or a
 * Weakened penalty, nothing more is recorded. Failures never stack.
 */
export function onFailedDay(
  open: OpenPenalty | null,
  mode: PenaltyMode,
  config: GameConfig = GAME_CONFIG,
): FailedDayAction {
  if (open === null || !isOpenPenalty(open.state)) {
    return { action: 'create', penalty: initialPenalty(mode, config) };
  }
  if (!open.escalated && (open.state === 'pending_choice' || open.state === 'trial_active')) {
    return { action: 'escalate', debtRatePercent: config.penalty.debtRatePercent.escalated };
  }
  return { action: 'none' };
}

/** A trial whose deadline passed escalates exactly like a second failure. */
export function onTrialExpired(config: GameConfig = GAME_CONFIG): FailedDayAction {
  return { action: 'escalate', debtRatePercent: config.penalty.debtRatePercent.escalated };
}

function mostCommon<T extends string>(values: readonly T[], order: readonly T[]): T {
  if (values.length === 0) throw new RangeError('mostCommon: nothing to choose from');
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const candidate of order) {
    const count = counts.get(candidate) ?? 0;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  if (best === null) throw new RangeError('mostCommon: values outside the tie-break order');
  return best;
}

export interface MissedQuest {
  category: Category;
  statTags: readonly StatId[];
}

/** Brief 3.4: the most common category among missed core quests, ties in config order. */
export function trialCategory(
  missed: readonly MissedQuest[],
  config: GameConfig = GAME_CONFIG,
): Category {
  return mostCommon(
    missed.map((quest) => quest.category),
    config.penalty.categoryOrder,
  );
}

/** Brief 3.4: the stat tagged most often among missed core quests, ties in stat order. */
export function weakenedStat(
  missed: readonly MissedQuest[],
  config: GameConfig = GAME_CONFIG,
): StatId {
  return mostCommon(
    missed.flatMap((quest) => quest.statTags),
    config.stats.ids,
  );
}

/** Half-up rounding of a non-negative rational a / b in exact integer arithmetic. */
function roundHalfUpRatio(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/**
 * Brief 3.4: debt = round(rate x xpToNext(level at creation)), half up (G5).
 * At the max level there is no next level, so the last real step is used.
 */
export function debtAmount(
  ratePercent: number,
  level: number,
  config: GameConfig = GAME_CONFIG,
): number {
  if (!Number.isInteger(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw new RangeError(`debtAmount: rate must be a whole percent, received ${ratePercent}`);
  }
  const { maxLevel } = config.levels;
  const step = xpToNext(Math.min(level, maxLevel - 1));
  return roundHalfUpRatio(ratePercent * step, 100);
}

/**
 * Brief 3.4: while debt remains, floor(xp / 2) of a positive award goes to
 * repayment, never more than what is left.
 */
export function debtRepayment(
  awardXp: number,
  debtRemaining: number,
  config: GameConfig = GAME_CONFIG,
): number {
  if (awardXp <= 0 || debtRemaining <= 0) return 0;
  return Math.min(Math.floor(awardXp / config.penalty.debtRepaymentDivisor), debtRemaining);
}

/**
 * Derived, never stored (ADR-1): the amount minus every repayment. Repayment
 * events carry negative XP and their reversals positive XP, so the sum of the
 * linked events is added.
 */
export function debtRemaining(amount: number, linkedRepaymentXp: readonly number[]): number {
  const repaid = -linkedRepaymentXp.reduce((sum, xp) => sum + xp, 0);
  return Math.min(amount, Math.max(0, amount - repaid));
}

/** Brief 3.4: Weakened covers the choice day and the next. */
export function weakenedWindow(
  choiceDay: string,
  config: GameConfig = GAME_CONFIG,
): { from: string; until: string } {
  return { from: choiceDay, until: addDays(choiceDay, config.penalty.weakenedDays - 1) };
}

export function isWeakenedOn(day: string, window: { from: string; until: string }): boolean {
  return day >= window.from && day <= window.until;
}

/** Brief 3.4: the trial deadline is the choice instant plus the configured hours. */
export function trialDeadline(chosenAt: Date, config: GameConfig = GAME_CONFIG): Date {
  return new Date(chosenAt.getTime() + config.penalty.trial.deadlineHours * 3_600_000);
}

/** Step 0 (G-c): completion is refused from the deadline on, before any lazy check. */
export function isTrialOpen(now: Date, deadline: Date): boolean {
  return now.getTime() < deadline.getTime();
}

export function trialTemplate(category: Category, config: GameConfig = GAME_CONFIG) {
  return config.penalty.trial.templates[category];
}
