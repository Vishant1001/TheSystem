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

const penaltyModeSchema = z.enum(['lenient', 'standard', 'hardcore']);
const categorySchema = z.enum(['fitness', 'diet', 'life']);
const statIdSchema = z.enum(['STR', 'AGI', 'VIT', 'INT', 'SENSE']);

const rulesSchema = z.object({
  penalty_mode: penaltyModeSchema,
  rest_days: z.array(z.coerce.number()),
});

export const safePeriodSchema = z.object({
  id: z.string(),
  kind: z.enum(['sick', 'travel']),
  start_on: z.string(),
  end_on: z.string(),
  ended_early_on: z.string().nullable(),
  last_safe_on: z.string(),
});

/** Brief 3.1 - 3.8: rules, rest and safe days, streak and stones. */
export const safeZonesSchema = z.object({
  rules_from: z.string(),
  rules_today: rulesSchema,
  rules_tomorrow: rulesSchema,
  is_rest_day_today: z.boolean(),
  is_safe_today: z.boolean(),
  streak: z.coerce.number(),
  stones_held: z.coerce.number(),
  safe_start_on: z.string(),
  safe_days_bookable: z.coerce.number(),
  safe_periods: z.array(safePeriodSchema),
});

export const penaltyStateSchema = z.enum([
  'pending_choice',
  'trial_active',
  'debt_active',
  'weakened_active',
  'cleared',
  'redeemed',
]);

/** Brief 3.3 - 3.5: the open penalty, as hunter_snapshot() describes it. */
export const penaltySchema = z.object({
  id: z.string(),
  state: penaltyStateSchema,
  choice: z.enum(['trial', 'debt', 'weakened']).nullable(),
  mode: penaltyModeSchema,
  escalated: z.boolean(),
  trigger_day: z.string(),
  missed_quests: z.array(
    z.object({
      quest_id: z.string().nullable(),
      title: z.string(),
      category: categorySchema,
      stat_tags: z.array(statIdSchema),
    }),
  ),
  needs_choice: z.boolean(),
  needs_acknowledgement: z.boolean(),
  trial: z
    .object({
      category: categorySchema,
      quest_id: z.string(),
      chosen_at: z.string(),
      deadline: z.string(),
    })
    .nullable(),
  debt: z
    .object({
      rate_percent: z.coerce.number(),
      level: z.coerce.number(),
      amount: z.coerce.number(),
      remaining: z.coerce.number(),
    })
    .nullable(),
  weakened: z
    .object({
      stat: statIdSchema,
      from: z.string(),
      until: z.string(),
    })
    .nullable(),
});

/** Brief 3.5: the concrete consequence of each option on the choice screen. */
export const penaltyOptionsSchema = z.object({
  trial: z.object({
    category: categorySchema,
    template: z.object({
      title: z.string(),
      goalType: z.enum(['duration', 'count']),
      target: z.coerce.number(),
      statTags: z.array(statIdSchema),
      tracking: z.string(),
    }),
    xp: z.coerce.number(),
    deadline_hours: z.coerce.number(),
  }),
  debt: z.object({ rate_percent: z.coerce.number(), amount: z.coerce.number() }),
  weakened: z.object({ stat: statIdSchema, days: z.coerce.number() }),
});

export type SafeZones = z.infer<typeof safeZonesSchema>;
export type SafePeriod = z.infer<typeof safePeriodSchema>;
export type Penalty = z.infer<typeof penaltySchema>;
export type PenaltyOptions = z.infer<typeof penaltyOptionsSchema>;

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
  safe_zones: safeZonesSchema,
  penalty: penaltySchema.nullable(),
  penalty_options: penaltyOptionsSchema.nullable(),
  weakened_stat_today: statIdSchema.nullable(),
  /** What the client must show, in this order: Report -> Penalty -> Level-up. */
  attention: z.object({
    report_days: z.coerce.number(),
    penalty_needs_choice: z.boolean(),
    penalty_needs_acknowledgement: z.boolean(),
  }),
});

export type HunterProfile = z.infer<typeof hunterProfileSchema>;
export type HunterSnapshot = z.infer<typeof hunterSnapshotSchema>;

/** The gates in order (brief 3.5). The level-up modal waits for both. */
export function attentionGate(snapshot: HunterSnapshot): 'report' | 'penalty' | null {
  if (snapshot.attention.report_days > 0) return 'report';
  if (snapshot.attention.penalty_needs_choice || snapshot.attention.penalty_needs_acknowledgement) {
    return 'penalty';
  }
  return null;
}

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
    /** Brief 3.7: still counts on a rest day. Core daily quests only. */
    onRestDays: z.boolean(),
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
