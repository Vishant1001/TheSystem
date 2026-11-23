import { z } from 'zod';
import rawConfig from './game-config.json';

/**
 * ADR-4: game-config.json is the single source of truth for every game number.
 * This module validates it; the SQL seed for `game_config` is generated from the
 * same file, and a test fails if the two drift.
 *
 * Nothing in src/game/ may hard-code a game number outside this file.
 */

export const STAT_IDS = ['STR', 'AGI', 'VIT', 'INT', 'SENSE'] as const;
export type StatId = (typeof STAT_IDS)[number];

export const DIFFICULTIES = ['E', 'D', 'C', 'B', 'A', 'S'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const CATEGORIES = ['fitness', 'diet', 'life'] as const;
export type Category = (typeof CATEGORIES)[number];

export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'] as const;
export type Rank = (typeof RANKS)[number];

export const PENALTY_MODES = ['lenient', 'standard', 'hardcore'] as const;
export type PenaltyMode = (typeof PENALTY_MODES)[number];

export const EXERCISE_KINDS = ['strength', 'cardio', 'mobility'] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

/** Every source that can grant XP through the single award path (brief section 6). */
export const AWARD_SOURCES = ['quest', 'workout', 'pr', 'boss', 'trial', 'daily_clear'] as const;
export type AwardSource = (typeof AWARD_SOURCES)[number];

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const percent = z.number().int().min(0).max(100);
const hour = z.number().int().min(0).max(23);
const statTags = z
  .array(z.enum(STAT_IDS))
  .min(1)
  .max(2)
  .refine((tags) => new Set(tags).size === tags.length, { message: 'duplicate stat tags' });

const awardSourceRule = z.object({ capped: z.boolean(), repaysDebt: z.boolean() });

const trialTemplate = z.object({
  title: z.string().min(1).max(80),
  goalType: z.enum(['duration', 'count']),
  target: positiveInt,
  statTags,
  tracking: z.enum(['manual', 'auto_food_count']),
});

/** An ordering that must name every member of `all` exactly once. */
function completeOrder<T extends string>(all: readonly T[]) {
  return z
    .array(z.enum(all as [T, ...T[]]))
    .refine((order) => order.length === all.length && new Set(order).size === all.length, {
      message: `must list each of ${all.join(', ')} exactly once`,
    });
}

const gameConfigSchema = z.object({
  version: positiveInt,
  dayRollover: z.object({
    /** A game day starts at this wall-clock hour in the hunter timezone (C5). */
    startHour: z.number().int().min(0).max(23),
  }),
  dayClose: z.object({
    /** Most game days close_days() will process in a single call (G8). */
    maxBackfillDays: positiveInt,
  }),
  levels: z.object({
    base: nonNegativeInt,
    coefficient: z.number().positive(),
    exponent: z.number().positive(),
    roundTo: positiveInt,
    startLevel: positiveInt,
    maxLevel: positiveInt,
  }),
  ranks: z
    .array(z.object({ rank: z.enum(RANKS), minLevel: positiveInt }))
    .min(1)
    .refine(
      (ranks) =>
        ranks.every((entry, index) => index === 0 || entry.minLevel > ranks[index - 1]!.minLevel),
      { message: 'ranks must be ordered by ascending minLevel' },
    ),
  stats: z.object({
    ids: z.array(z.enum(STAT_IDS)).length(STAT_IDS.length),
    startValue: positiveInt,
    xpBase: positiveInt,
    xpPerPoint: nonNegativeInt,
  }),
  freePoints: z.object({
    perLevel: nonNegativeInt,
    perDailyClear: nonNegativeInt,
  }),
  rewards: z.object({
    xpByDifficulty: z.object({
      E: nonNegativeInt,
      D: nonNegativeInt,
      C: nonNegativeInt,
      B: nonNegativeInt,
      A: nonNegativeInt,
      S: nonNegativeInt,
    }),
    statXpDivisor: positiveInt,
    minStatXpPerTag: nonNegativeInt,
    maxStatTags: positiveInt,
  }),
  dailyCaps: z.object({
    fitness: nonNegativeInt,
    diet: nonNegativeInt,
    life: nonNegativeInt,
  }),
  /** Which award sources are capped by category and which pay debt (brief 3.4 / 6). */
  awardSources: z.object({
    quest: awardSourceRule,
    workout: awardSourceRule,
    pr: awardSourceRule,
    boss: awardSourceRule,
    trial: awardSourceRule,
    daily_clear: awardSourceRule,
  }),
  penalty: z.object({
    modes: completeOrder(PENALTY_MODES),
    defaultMode: z.enum(PENALTY_MODES),
    /** Local game-time hour the warning window opens; it closes at the rollover. */
    warningStartHour: z.object({ lenient: hour, standard: hour, hardcore: hour }),
    debtRatePercent: z.object({ lenient: percent, standard: percent, escalated: percent }),
    debtRepaymentDivisor: positiveInt,
    /** Tie-break order for the Survival Trial category. */
    categoryOrder: completeOrder(CATEGORIES),
    weakenedDays: positiveInt,
    trial: z.object({
      xp: nonNegativeInt,
      deadlineHours: positiveInt,
      maxTarget: z.object({ duration: positiveInt, count: positiveInt }),
      templates: z.object({ fitness: trialTemplate, diet: trialTemplate, life: trialTemplate }),
    }),
  }),
  stones: z.object({
    streakInterval: positiveInt,
    maxHeld: positiveInt,
  }),
  safeZones: z.object({
    maxRestDays: z.number().int().min(0).max(7),
    minPeriodDays: positiveInt,
    maxPeriodDays: positiveInt,
    quotaDays: positiveInt,
    quotaWindowDays: positiveInt,
  }),
  gym: z.object({
    kinds: z.object({
      strength: z.enum(STAT_IDS),
      cardio: z.enum(STAT_IDS),
      mobility: z.enum(STAT_IDS),
    }),
    libraryCategoryKinds: z.record(z.string().min(1), z.enum(EXERCISE_KINDS)),
    setXp: nonNegativeInt,
    maxWorkingSetsPerDay: positiveInt,
    pr: z.object({
      xp: nonNegativeInt,
      statXp: nonNegativeInt,
      maxBonusesPerDay: nonNegativeInt,
      e1rmMinReps: positiveInt,
      e1rmMaxReps: positiveInt,
      e1rmRepsDivisor: positiveInt,
      kinds: z.array(z.enum(EXERCISE_KINDS)).min(1),
    }),
    boss: z.object({
      xpMultiplier: positiveInt,
      freePoints: nonNegativeInt,
      maxActive: positiveInt,
      defaultTargetReps: positiveInt,
      kinds: z.array(z.enum(EXERCISE_KINDS)).min(1),
    }),
    restTimer: z.object({
      defaultSeconds: positiveInt,
      stepSeconds: positiveInt,
      minSeconds: positiveInt,
      maxSeconds: positiveInt,
    }),
  }),
});

export type GameConfig = z.infer<typeof gameConfigSchema>;

/** Parsed once at module load; a malformed config is a startup failure, not a silent bug. */
export const GAME_CONFIG: GameConfig = gameConfigSchema
  .superRefine((config, ctx) => {
    // Hard rule (brief 3.4): template sizes are capped, and a trial is never
    // about eating less - diet trials are logging-only.
    for (const category of CATEGORIES) {
      const template = config.penalty.trial.templates[category];
      if (template.target > config.penalty.trial.maxTarget[template.goalType]) {
        ctx.addIssue({ code: 'custom', message: `trial template ${category} exceeds its cap` });
      }
    }
    if (config.penalty.trial.templates.diet.tracking !== 'auto_food_count') {
      ctx.addIssue({ code: 'custom', message: 'the diet trial must be a logging-only trial' });
    }
    // The warning window must sit inside the game day, after the rollover.
    for (const mode of PENALTY_MODES) {
      if (config.penalty.warningStartHour[mode] <= config.dayRollover.startHour) {
        ctx.addIssue({ code: 'custom', message: `warning hour for ${mode} must follow rollover` });
      }
    }
    const { minPeriodDays, maxPeriodDays, quotaDays, quotaWindowDays } = config.safeZones;
    if (minPeriodDays > maxPeriodDays || quotaDays > quotaWindowDays) {
      ctx.addIssue({ code: 'custom', message: 'safe zone limits are inconsistent' });
    }
    const { e1rmMinReps, e1rmMaxReps } = config.gym.pr;
    if (e1rmMinReps > e1rmMaxReps) {
      ctx.addIssue({ code: 'custom', message: 'e1RM rep range is empty' });
    }
    const timer = config.gym.restTimer;
    if (
      timer.minSeconds > timer.defaultSeconds ||
      timer.defaultSeconds > timer.maxSeconds ||
      timer.defaultSeconds % timer.stepSeconds !== 0
    ) {
      ctx.addIssue({ code: 'custom', message: 'rest timer limits are inconsistent' });
    }
  })
  .parse(rawConfig);

/** The subset of the config that the database also needs (ADR-4). */
export function sqlConfigSlice(config: GameConfig = GAME_CONFIG) {
  return {
    version: config.version,
    quest_xp_by_difficulty: config.rewards.xpByDifficulty,
    daily_caps: config.dailyCaps,
    stat_xp_divisor: config.rewards.statXpDivisor,
    min_stat_xp_per_tag: config.rewards.minStatXpPerTag,
    game_day_start_hour: config.dayRollover.startHour,
    free_points_per_daily_clear: config.freePoints.perDailyClear,
    close_days_max_backfill: config.dayClose.maxBackfillDays,
    // Phase 2. ADR-4 as amended: TypeScript stays the reference for the level
    // curve, and SQL may read it (debt is sized from xpToNext at close time).
    level_curve: config.levels,
    stat_order: config.stats.ids,
    award_sources: config.awardSources,
    penalty: config.penalty,
    stones: config.stones,
    safe_zones: config.safeZones,
    gym: config.gym,
  };
}
