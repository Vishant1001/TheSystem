import { GAME_CONFIG, type AwardSource, type GameConfig, type StatId } from './config';
import { debtRepayment } from './penalty';
import { emptyStatRecord } from './stats';

/**
 * Brief section 6: the single award pipeline, as a pure twin of the SQL
 * function every XP-granting RPC goes through.
 *
 *   1. base amount      (difficulty / sets / PR / boss / trial)
 *   2. category cap     (quest and workout only)
 *   3. Weakened         (zero the weakened stat's stat XP)
 *   4. debt repayment   (quest, workout and PR only) -> linked event
 *   5. insert           (the SQL side)
 *
 * Stat XP by source:
 * - quest, trial: floor(full / 2), scaled by the cap ratio when capped, split
 *   evenly with the remainder to the first tag (G1); min 1 per tag only when
 *   uncapped (G2). Identical to computeQuestAward.
 * - workout, boss: floor(awarded XP / 2) from the capped amount (step 0, G-h),
 *   split by weight (sets per stat), remainder to the first, no minimum.
 * - pr: the configured fixed stat XP to its tag.
 * - daily_clear: none.
 */

export interface StatWeight {
  stat: StatId;
  /** Relative share; equal weights reproduce the even G1 split. */
  weight: number;
}

export interface AwardInput {
  source: AwardSource;
  /** Step 1: the base XP before any cap. */
  fullXp: number;
  /** Cap room left in the category today. Ignored for uncapped sources. */
  capRoom: number;
  /** Stats the award feeds, in tag order. Empty for daily_clear. */
  stats: readonly StatWeight[];
  /** The stat zeroed by an active Weakened penalty today, if any. */
  weakenedStat: StatId | null;
  /** Debt left on the open penalty, 0 when there is none. */
  debtRemaining: number;
}

export interface Award {
  xp: number;
  fullXp: number;
  capped: boolean;
  statXp: Record<StatId, number>;
  /** True when Weakened zeroed stat XP the award would otherwise have paid. */
  weakened: boolean;
  /** XP diverted into the linked debt_repayment event (stored as its negative). */
  repayment: number;
}

function assertWeights(stats: readonly StatWeight[]): void {
  if (new Set(stats.map((entry) => entry.stat)).size !== stats.length) {
    throw new RangeError('award: a stat may appear only once');
  }
  if (stats.some((entry) => !Number.isInteger(entry.weight) || entry.weight <= 0)) {
    throw new RangeError('award: weights must be positive integers');
  }
}

/** Floor each share of `total`, then hand the remainder to the first entry (G1). */
export function splitByWeight(
  total: number,
  stats: readonly StatWeight[],
  minimumPerStat = 0,
): Record<StatId, number> {
  assertWeights(stats);
  const split = emptyStatRecord();
  const first = stats[0];
  if (first === undefined) return split;

  const safeTotal = Math.max(0, Math.floor(total));
  const totalWeight = stats.reduce((sum, entry) => sum + entry.weight, 0);
  let given = 0;
  for (const entry of stats) {
    const share = Math.floor((safeTotal * entry.weight) / totalWeight);
    split[entry.stat] = share;
    given += share;
  }
  split[first.stat] += safeTotal - given;

  if (minimumPerStat > 0) {
    for (const entry of stats) split[entry.stat] = Math.max(split[entry.stat], minimumPerStat);
  }
  return split;
}

function statXpFor(
  source: AwardSource,
  xp: number,
  fullXp: number,
  capped: boolean,
  stats: readonly StatWeight[],
  config: GameConfig,
): Record<StatId, number> {
  const divisor = config.rewards.statXpDivisor;
  switch (source) {
    case 'quest':
    case 'trial': {
      const even = stats.map((entry) => ({ stat: entry.stat, weight: 1 }));
      const full = Math.floor(fullXp / divisor);
      const total = fullXp === 0 ? 0 : capped ? Math.floor((full * xp) / fullXp) : full;
      return splitByWeight(total, even, capped ? 0 : config.rewards.minStatXpPerTag);
    }
    case 'workout':
    case 'boss':
      return splitByWeight(Math.floor(xp / divisor), stats);
    case 'pr':
      return splitByWeight(xp > 0 ? config.gym.pr.statXp : 0, stats);
    case 'daily_clear':
      return emptyStatRecord();
  }
}

export function computeAward(input: AwardInput, config: GameConfig = GAME_CONFIG): Award {
  if (!Number.isInteger(input.fullXp) || input.fullXp < 0) {
    throw new RangeError(`award: fullXp must be a non-negative integer, received ${input.fullXp}`);
  }
  const rule = config.awardSources[input.source];

  // 2. Category cap.
  const capRoom = Math.max(0, Math.floor(input.capRoom));
  const xp = rule.capped ? Math.min(input.fullXp, capRoom) : input.fullXp;
  const capped = xp < input.fullXp;

  const statXp = statXpFor(input.source, xp, input.fullXp, capped, input.stats, config);

  // 3. Weakened.
  let weakened = false;
  if (input.weakenedStat !== null && statXp[input.weakenedStat] > 0) {
    statXp[input.weakenedStat] = 0;
    weakened = true;
  }

  // 4. Debt repayment.
  const repayment = rule.repaysDebt ? debtRepayment(xp, input.debtRemaining, config) : 0;

  return { xp, fullXp: input.fullXp, capped, statXp, weakened, repayment };
}

/** Cap room for a capped source: the cap minus what capped sources already paid today. */
export function capRoom(cap: number, cappedXpToday: number): number {
  return Math.max(0, cap - Math.max(0, Math.floor(cappedXpToday)));
}
