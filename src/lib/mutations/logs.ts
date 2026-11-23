import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { hunterSnapshotKey } from '../queries/hunterSnapshot';
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
});

/** delete_workout reports no set_count, so it is optional for both paths. */
export const workoutMutationSchema = z.object({
  workout_id: z.string(),
  occurred_on: z.string(),
  set_count: z.coerce.number().optional(),
  auto_workout: autoOutcomeSchema,
});

/** The award behind a 'completed' outcome, or null for anything else. */
export function awardFromOutcome(outcome: AutoOutcome) {
  if (outcome.action !== 'completed') return null;
  const parsed = questAwardSchema.safeParse(outcome.result);
  return parsed.success ? parsed.data : null;
}

export type AutoOutcome = z.infer<typeof autoOutcomeSchema>;

/** The index signature keeps this assignable to the generated Json type. */
export interface WorkoutSetInput {
  [key: string]: string | number | null;
  exercise_name: string;
  reps: number;
  weight_kg: number | null;
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
