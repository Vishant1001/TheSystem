import {
  EXERCISE_KINDS,
  GAME_CONFIG,
  type Difficulty,
  type ExerciseKind,
  type GameConfig,
  type StatId,
} from './config';
import type { StatWeight } from './award';

/**
 * Brief section 4. Weights are handled in centi-kilograms (integers), because
 * the database stores numeric(6, 2): integer arithmetic keeps the engine and
 * SQL bit-for-bit identical.
 */

export type SetType = 'warmup' | 'working';
export type PrKind = 'e1rm' | 'max_weight';

/** Library category -> XP kind (brief 4.1, step 0 G-i). Unknown categories are an error. */
export function kindForLibraryCategory(
  category: string,
  config: GameConfig = GAME_CONFIG,
): ExerciseKind {
  const kind = config.gym.libraryCategoryKinds[category];
  if (kind === undefined) throw new RangeError(`no exercise kind for library category ${category}`);
  return kind;
}

export function statForKind(kind: ExerciseKind, config: GameConfig = GAME_CONFIG): StatId {
  return config.gym.kinds[kind];
}

/** kg (at most two decimals) -> centi-kg. */
export function toCentiKg(kg: number): number {
  const centi = Math.round(kg * 100);
  if (Math.abs(centi - kg * 100) > 1e-6) {
    throw new RangeError(`weights carry at most two decimals, received ${kg}`);
  }
  return centi;
}

export function fromCentiKg(centi: number): number {
  return centi / 100;
}

/**
 * Epley e1RM = weight x (1 + reps / 30), in centi-kg rounded half up, defined
 * only for 1-12 reps (config) and a positive weight.
 */
export function e1rmCentiKg(
  weightCentiKg: number,
  reps: number,
  config: GameConfig = GAME_CONFIG,
): number | null {
  const { e1rmMinReps, e1rmMaxReps, e1rmRepsDivisor } = config.gym.pr;
  if (!Number.isInteger(reps) || reps < e1rmMinReps || reps > e1rmMaxReps) return null;
  if (!Number.isInteger(weightCentiKg) || weightCentiKg <= 0) return null;
  const numerator = weightCentiKg * (e1rmRepsDivisor + reps);
  return Math.floor((2 * numerator + e1rmRepsDivisor) / (2 * e1rmRepsDivisor));
}

export interface LoggedSet {
  setType: SetType;
  reps: number | null;
  weightKg: number | null;
}

export interface PrRecord {
  prKind: PrKind;
  valueCentiKg: number;
  /** Position of the set within this exercise's sets in the workout. */
  setIndex: number;
  /** First record of this kind for the exercise: stored, never rewarded. */
  baseline: boolean;
}

export interface PrDetection {
  records: PrRecord[];
  /** Distinct sets that broke a record; each pays one bonus (step 0, G-g). */
  bonusSetIndexes: number[];
}

/**
 * Brief 4.4, as amended at step 0: working sets only, strength kind only, the
 * best set per PR kind per exercise per workout (earliest on a tie), strictly
 * better than the derived current best. No prior record of a kind -> baseline.
 */
export function detectPrs(
  input: {
    kind: ExerciseKind;
    prior: { e1rm: number | null; maxWeight: number | null };
    sets: readonly LoggedSet[];
  },
  config: GameConfig = GAME_CONFIG,
): PrDetection {
  const none: PrDetection = { records: [], bonusSetIndexes: [] };
  if (!config.gym.pr.kinds.includes(input.kind)) return none;

  const best: Record<PrKind, { value: number; setIndex: number } | null> = {
    e1rm: null,
    max_weight: null,
  };
  input.sets.forEach((set, setIndex) => {
    if (set.setType !== 'working' || set.reps === null || set.reps < 1) return;
    if (set.weightKg === null || set.weightKg <= 0) return;
    const weight = toCentiKg(set.weightKg);
    const candidates: [PrKind, number | null][] = [
      ['e1rm', e1rmCentiKg(weight, set.reps, config)],
      ['max_weight', weight],
    ];
    for (const [prKind, value] of candidates) {
      const current = best[prKind];
      if (value !== null && (current === null || value > current.value)) {
        best[prKind] = { value, setIndex };
      }
    }
  });

  const records: PrRecord[] = [];
  const priors: Record<PrKind, number | null> = {
    e1rm: input.prior.e1rm,
    max_weight: input.prior.maxWeight,
  };
  for (const prKind of ['e1rm', 'max_weight'] as const) {
    const top = best[prKind];
    if (top === null) continue;
    const prior = priors[prKind];
    if (prior === null) {
      records.push({ prKind, valueCentiKg: top.value, setIndex: top.setIndex, baseline: true });
    } else if (top.value > prior) {
      records.push({ prKind, valueCentiKg: top.value, setIndex: top.setIndex, baseline: false });
    }
  }

  const bonusSetIndexes = [
    ...new Set(records.filter((record) => !record.baseline).map((record) => record.setIndex)),
  ].sort((a, b) => a - b);
  return { records, bonusSetIndexes };
}

/** How many of `candidates` PR bonuses still pay today (max 2 per game day). */
export function payablePrBonuses(
  candidates: number,
  alreadyPaidToday: number,
  config: GameConfig = GAME_CONFIG,
): number {
  const room = Math.max(0, config.gym.pr.maxBonusesPerDay - alreadyPaidToday);
  return Math.min(Math.max(0, candidates), room);
}

export interface WorkoutSetInput {
  kind: ExerciseKind;
  setType: SetType;
}

export interface WorkoutSetXp {
  /** Working sets that earned XP (in log order, up to the daily allowance). */
  countedSets: number;
  /** Base XP before the fitness cap. */
  fullXp: number;
  /** Stat weights for the award pipeline: counted sets per kind, in kind order. */
  stats: StatWeight[];
}

/**
 * Brief 4.3: 2 XP per working set, warmups 0, at most 20 working sets per game
 * day across all workouts. `workingSetsCountedToday` is what earlier workouts
 * today already counted.
 */
export function workoutSetXp(
  sets: readonly WorkoutSetInput[],
  workingSetsCountedToday: number,
  config: GameConfig = GAME_CONFIG,
): WorkoutSetXp {
  let allowance = Math.max(0, config.gym.maxWorkingSetsPerDay - workingSetsCountedToday);
  const perKind: Record<ExerciseKind, number> = { strength: 0, cardio: 0, mobility: 0 };
  let countedSets = 0;
  for (const set of sets) {
    if (set.setType !== 'working' || allowance === 0) continue;
    perKind[set.kind] += 1;
    countedSets += 1;
    allowance -= 1;
  }

  // Kinds sharing a stat are merged so a stat appears once.
  const weights = new Map<StatId, number>();
  for (const kind of EXERCISE_KINDS) {
    if (perKind[kind] === 0) continue;
    const stat = statForKind(kind, config);
    weights.set(stat, (weights.get(stat) ?? 0) + perKind[kind]);
  }
  return {
    countedSets,
    fullXp: countedSets * config.gym.setXp,
    stats: [...weights].map(([stat, weight]) => ({ stat, weight })),
  };
}

export interface BossTarget {
  kind: ExerciseKind;
  targetWeightKg: number;
  targetReps: number;
}

/** Brief 4.5: a working set with weight >= target and reps >= target reps. */
export function defeatsBoss(
  boss: BossTarget,
  set: LoggedSet,
  config: GameConfig = GAME_CONFIG,
): boolean {
  if (!config.gym.boss.kinds.includes(boss.kind)) return false;
  if (set.setType !== 'working' || set.reps === null || set.weightKg === null) return false;
  return set.reps >= boss.targetReps && toCentiKg(set.weightKg) >= toCentiKg(boss.targetWeightKg);
}

/** Brief 4.5: 2x the difficulty XP, plus the configured free points. */
export function bossReward(
  difficulty: Difficulty,
  config: GameConfig = GAME_CONFIG,
): { xp: number; freePoints: number } {
  return {
    xp: config.gym.boss.xpMultiplier * config.rewards.xpByDifficulty[difficulty],
    freePoints: config.gym.boss.freePoints,
  };
}

/** PRs and bosses are for strength exercises only (step 0, G-g / G-i). */
export function canHaveBoss(kind: ExerciseKind, config: GameConfig = GAME_CONFIG): boolean {
  return config.gym.boss.kinds.includes(kind);
}
