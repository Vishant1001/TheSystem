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

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();

const gameConfigSchema = z.object({
  version: positiveInt,
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
});

export type GameConfig = z.infer<typeof gameConfigSchema>;

/** Parsed once at module load; a malformed config is a startup failure, not a silent bug. */
export const GAME_CONFIG: GameConfig = gameConfigSchema.parse(rawConfig);

/** The subset of the config that the database also needs (ADR-4). */
export function sqlConfigSlice(config: GameConfig = GAME_CONFIG) {
  return {
    version: config.version,
    quest_xp_by_difficulty: config.rewards.xpByDifficulty,
    daily_caps: config.dailyCaps,
    stat_xp_divisor: config.rewards.statXpDivisor,
    min_stat_xp_per_tag: config.rewards.minStatXpPerTag,
  };
}
