import { z } from 'zod';
import { systemCopy } from '../copy/system';
import { STAT_IDS, type StatId } from '../game';

/**
 * RPCs return jsonb, which arrives untyped. Everything crossing that boundary
 * is parsed here, so the rest of the app works with real types and a malformed
 * payload fails loudly at the edge instead of silently rendering NaN.
 */

const statRecordSchema = z.object({
  STR: z.coerce.number(),
  AGI: z.coerce.number(),
  VIT: z.coerce.number(),
  INT: z.coerce.number(),
  SENSE: z.coerce.number(),
}) satisfies z.ZodType<Record<StatId, number>>;

const categoryRecordSchema = z.object({
  fitness: z.coerce.number(),
  diet: z.coerce.number(),
  life: z.coerce.number(),
});

export const hunterProfileSchema = z.object({
  user_id: z.string(),
  hunter_name: z.string(),
  timezone: z.string(),
  kcal_min: z.coerce.number(),
  kcal_max: z.coerce.number(),
  protein_target_g: z.coerce.number(),
  created_on: z.string(),
  last_closed_on: z.string().nullable(),
});

export const hunterSnapshotSchema = z.object({
  hunter: hunterProfileSchema,
  game_today: z.string(),
  total_xp: z.coerce.number(),
  stat_xp: statRecordSchema,
  free_points_from_events: z.coerce.number(),
  allocated_points: statRecordSchema,
  today_xp_by_category: categoryRecordSchema,
  effective_targets_today: z.object({
    kcal_min: z.coerce.number(),
    kcal_max: z.coerce.number(),
    protein_target_g: z.coerce.number(),
  }),
  daily_caps: categoryRecordSchema,
  unacknowledged_days: z.coerce.number(),
});

export type HunterProfile = z.infer<typeof hunterProfileSchema>;
export type HunterSnapshot = z.infer<typeof hunterSnapshotSchema>;

/** Credentials form (/auth). */
export const credentialsSchema = z.object({
  email: z.email(systemCopy.validation.email),
  password: z.string().min(8, systemCopy.validation.passwordLength),
});

export type Credentials = z.infer<typeof credentialsSchema>;

/** Onboarding and Hunter Settings share these fields (5.7, C4). */
export const hunterProfileInputSchema = z
  .object({
    hunterName: z
      .string()
      .trim()
      .min(1, systemCopy.validation.hunterName)
      .max(40, systemCopy.validation.hunterNameLength),
    timezone: z.string().min(1, systemCopy.validation.timezone),
    kcalMin: z.coerce
      .number()
      .int()
      .min(500, systemCopy.validation.tooLow)
      .max(10000, systemCopy.validation.tooHigh),
    kcalMax: z.coerce
      .number()
      .int()
      .min(500, systemCopy.validation.tooLow)
      .max(10000, systemCopy.validation.tooHigh),
    proteinTargetG: z.coerce
      .number()
      .min(1, systemCopy.validation.proteinTarget)
      .max(500, systemCopy.validation.tooHigh),
  })
  .refine((value) => value.kcalMax >= value.kcalMin, {
    message: systemCopy.validation.kcalOrder,
    path: ['kcalMax'],
  });

export type HunterProfileInput = z.infer<typeof hunterProfileInputSchema>;

/** Defaults the brief specifies for onboarding (5.7). */
export const ONBOARDING_DEFAULTS = {
  timezone: 'Europe/Berlin',
  kcalMin: 1700,
  kcalMax: 1900,
  proteinTargetG: 120,
} as const;

/** Turns a parsed snapshot into the shape the pure engine expects. */
export function toEngineSnapshot(snapshot: HunterSnapshot) {
  const statXp = {} as Record<StatId, number>;
  const allocatedPoints = {} as Record<StatId, number>;
  for (const id of STAT_IDS) {
    statXp[id] = snapshot.stat_xp[id];
    allocatedPoints[id] = snapshot.allocated_points[id];
  }
  return {
    totalXp: snapshot.total_xp,
    statXp,
    freePointsFromEvents: snapshot.free_points_from_events,
    allocatedPoints,
  };
}

/** Custom quests (brief 7.2). Mirrors the check constraints on public.quests. */
export const questInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, systemCopy.validation.questTitle)
      .max(80, systemCopy.validation.questTitleLength),
    type: z.enum(['daily', 'one_time']),
    category: z.enum(['fitness', 'diet', 'life']),
    goalType: z.enum(['boolean', 'count', 'duration', 'numeric']),
    targetValue: z.number().positive(systemCopy.validation.targetPositive).nullable(),
    unit: z.string().trim().max(12, systemCopy.validation.unitLength).nullable(),
    statTags: z
      .array(z.enum(['STR', 'AGI', 'VIT', 'INT', 'SENSE']))
      .min(1, systemCopy.validation.statsMin)
      .max(2, systemCopy.validation.statsMax),
    difficulty: z.enum(['E', 'D', 'C', 'B', 'A', 'S']),
    isCore: z.boolean(),
    scheduleDays: z.array(z.number().int().min(1).max(7)).nullable(),
    dueOn: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    if (
      value.type === 'daily' &&
      (value.scheduleDays === null || value.scheduleDays.length === 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['scheduleDays'],
        message: systemCopy.validation.scheduleDays,
      });
    }
    if (value.goalType !== 'boolean' && value.targetValue === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetValue'],
        message: systemCopy.validation.target,
      });
    }
    if (value.type === 'one_time' && value.isCore && value.dueOn === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['dueOn'],
        message: systemCopy.validation.coreNeedsDueDate,
      });
    }
    if (new Set(value.statTags).size !== value.statTags.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['statTags'],
        message: systemCopy.validation.statsDistinct,
      });
    }
  });

export type QuestInput = z.infer<typeof questInputSchema>;
