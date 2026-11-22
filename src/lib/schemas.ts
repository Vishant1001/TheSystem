import { z } from 'zod';
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
  email: z.email('That is not an email address.'),
  password: z.string().min(8, 'Use at least 8 characters.'),
});

export type Credentials = z.infer<typeof credentialsSchema>;

/** Onboarding and Hunter Settings share these fields (5.7, C4). */
export const hunterProfileInputSchema = z
  .object({
    hunterName: z
      .string()
      .trim()
      .min(1, 'Choose a hunter name.')
      .max(40, 'Keep it under 40 characters.'),
    timezone: z.string().min(1, 'Choose a timezone.'),
    kcalMin: z.coerce.number().int().min(500, 'That is too low.').max(10000, 'That is too high.'),
    kcalMax: z.coerce.number().int().min(500, 'That is too low.').max(10000, 'That is too high.'),
    proteinTargetG: z.coerce.number().min(1, 'Set a protein target.').max(500, 'That is too high.'),
  })
  .refine((value) => value.kcalMax >= value.kcalMin, {
    message: 'The upper calorie bound must not be below the lower one.',
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
