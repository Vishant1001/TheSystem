import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { hunterSnapshotKey } from '../queries/hunterSnapshot';
import { gymKey } from '../queries/gym';
import { foodKey, workoutsKey } from '../queries/logs';
import { completionsKey, oneTimeCompletionsKey, questsKey } from '../queries/quests';
import { supabase } from '../supabase';
import { questAwardSchema } from './quests';

/**
 * Logging RPCs re-evaluate the auto quests server-side and report what they
 * did, so the UI can raise the same completion toast a manual quest raises.
 */
/**
 * `result` carries an award when the evaluation completed a quest, and a
 * reversal summary when it withdrew one - two different shapes. It stays
 * unknown here and is parsed as an award only where that is what it is.
 */
export const autoOutcomeSchema = z.object({
  evaluated: z.boolean(),
  action: z.enum(['completed', 'reversed', 'unchanged']).optional(),
  result: z.unknown().optional(),
});

export const foodMutationSchema = z.object({
  entry_id: z.string(),
  occurred_on: z.string(),
  auto_protein: autoOutcomeSchema,
  /** Brief 3.4: the diet Survival Trial, when this entry completed it. */
  trial: z.unknown().optional(),
});

/** The trial award behind a food log, when that log cleared the trial. */
export function trialAwardFrom(trial: unknown) {
  const parsed = questAwardSchema.extend({ penalty_cleared: z.literal(true) }).safeParse(trial);
  return parsed.success ? parsed.data : null;
}

const statXpSchema = z.object({
  STR: z.coerce.number(),
  AGI: z.coerce.number(),
  VIT: z.coerce.number(),
  INT: z.coerce.number(),
  SENSE: z.coerce.number(),
});

/** One apply_award result (Step 2.3 pipeline) as the gym replies carry it. */
export const gymAwardSchema = z.object({
  event_id: z.string(),
  xp: z.coerce.number(),
  full_xp: z.coerce.number(),
  capped: z.boolean(),
  stat_xp: statXpSchema,
  weakened: z.boolean().default(false),
  free_points: z.coerce.number().default(0),
  debt_repayment: z.coerce.number().default(0),
});

export const prRecordSchema = z.object({
  record_id: z.string(),
  exercise_id: z.string(),
  exercise_name: z.string(),
  pr_kind: z.enum(['e1rm', 'max_weight']),
  value_centi: z.coerce.number(),
  baseline: z.boolean(),
  set_id: z.string(),
  bonus_event_id: z.string().nullable(),
});

/**
 * delete_workout reports no set_count, so it is optional for both paths. The
 * gym fields (Step 2.6) are log_workout only.
 */
export const workoutMutationSchema = z.object({
  workout_id: z.string(),
  occurred_on: z.string(),
  set_count: z.coerce.number().optional(),
  auto_workout: autoOutcomeSchema,
  counted_sets: z.coerce.number().optional(),
  workout_award: gymAwardSchema.nullable().optional(),
  records: z.array(prRecordSchema).default([]),
  pr_bonuses: z
    .array(gymAwardSchema.extend({ set_id: z.string(), exercise_name: z.string() }))
    .default([]),
  bosses_defeated: z
    .array(gymAwardSchema.extend({ boss_id: z.string(), boss_name: z.string() }))
    .default([]),
});

export type WorkoutMutationResult = z.infer<typeof workoutMutationSchema>;
export type GymAward = z.infer<typeof gymAwardSchema>;

/** The award behind a 'completed' outcome, or null for anything else. */
export function awardFromOutcome(outcome: AutoOutcome) {
  if (outcome.action !== 'completed') return null;
  const parsed = questAwardSchema.safeParse(outcome.result);
  return parsed.success ? parsed.data : null;
}

export type AutoOutcome = z.infer<typeof autoOutcomeSchema>;

/**
 * One set of the log_workout payload (Step 2.6 shape). The index signature
 * keeps it assignable to the generated Json type.
 */
export interface WorkoutSetInput {
  [key: string]: string | number | null;
  exercise_id: string;
  set_type: 'warmup' | 'working';
  reps: number | null;
  weight_kg: number | null;
  duration_s: number | null;
  distance_m: number | null;
}

function useLogInvalidation(day: string | undefined) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: hunterSnapshotKey }),
      queryClient.invalidateQueries({ queryKey: questsKey }),
      queryClient.invalidateQueries({ queryKey: oneTimeCompletionsKey }),
      day === undefined
        ? Promise.resolve()
        : Promise.all([
            queryClient.invalidateQueries({ queryKey: foodKey(day) }),
            queryClient.invalidateQueries({ queryKey: workoutsKey(day) }),
            queryClient.invalidateQueries({ queryKey: completionsKey(day) }),
          ]),
      // Workouts move history, records, bosses and the picker's ordering.
      queryClient.invalidateQueries({ queryKey: gymKey }),
    ]);
  };
}

export function useLogFood(day: string | undefined) {
  const invalidate = useLogInvalidation(day);

  return useMutation({
    mutationFn: async (input: { name: string; kcal: number; proteinG: number }) => {
      const { data, error } = await supabase.rpc('log_food', {
        p_name: input.name,
        p_kcal: input.kcal,
        p_protein_g: input.proteinG,
      });
      if (error) throw error;
      return foodMutationSchema.parse(data);
    },
    onSettled: async () => {
      await invalidate();
    },
  });
}

export function useDeleteFood(day: string | undefined) {
  const invalidate = useLogInvalidation(day);

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('delete_food', { p_id: id });
      if (error) throw error;
      return foodMutationSchema.parse(data);
    },
    onSettled: async () => {
      await invalidate();
    },
  });
}

export function useLogWorkout(day: string | undefined) {
  const invalidate = useLogInvalidation(day);

  return useMutation({
    mutationFn: async (input: { title: string; notes: string | null; sets: WorkoutSetInput[] }) => {
      const { data, error } = await supabase.rpc('log_workout', {
        p_title: input.title,
        p_notes: input.notes ?? '',
        p_sets: input.sets,
      });
      if (error) throw error;
      return workoutMutationSchema.parse(data);
    },
    onSettled: async () => {
      await invalidate();
    },
  });
}

export function useDeleteWorkout(day: string | undefined) {
  const invalidate = useLogInvalidation(day);

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('delete_workout', { p_id: id });
      if (error) throw error;
      return workoutMutationSchema.parse(data);
    },
    onSettled: async () => {
      await invalidate();
    },
  });
}
