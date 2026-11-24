import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { EXERCISE_KINDS, type Difficulty, type ExerciseKind } from '../../game';
import { hunterSnapshotKey } from '../queries/hunterSnapshot';
import { gymKey } from '../queries/gym';
import { supabase } from '../supabase';

/** Every gym write re-syncs every gym query, success or not (Step 1.6 rule). */
function useGymInvalidation() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: gymKey });
  };
}

const createdExerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(EXERCISE_KINDS),
});

/** A custom exercise (RLS allows the owner to insert their own). */
export function useCreateExercise() {
  const invalidate = useGymInvalidation();
  return useMutation({
    mutationFn: async (input: { name: string; kind: ExerciseKind }) => {
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user.id;
      if (userId === undefined) throw new Error('AUTH_REQUIRED');
      const { data, error } = await supabase
        .from('exercises')
        .insert({ user_id: userId, name: input.name.trim(), kind: input.kind })
        .select('id, name, kind')
        .single();
      if (error) throw error;
      return createdExerciseSchema.parse(data);
    },
    onSettled: invalidate,
  });
}

export const mergeResultSchema = z.object({
  from_id: z.string(),
  into_id: z.string(),
  into_name: z.string(),
  already_merged: z.boolean(),
  sets_moved: z.coerce.number(),
  bosses_moved: z.coerce.number(),
  records_retired: z.coerce.number(),
  baselines_added: z.coerce.number(),
});

export function useMergeExercise() {
  const invalidate = useGymInvalidation();
  return useMutation({
    mutationFn: async (input: { fromId: string; intoId: string }) => {
      const { data, error } = await supabase.rpc('merge_exercise', {
        p_from_custom_id: input.fromId,
        p_into_exercise_id: input.intoId,
      });
      if (error) throw error;
      return mergeResultSchema.parse(data);
    },
    onSettled: invalidate,
  });
}

export interface BossInput {
  targetWeightKg: number;
  targetReps: number;
  difficulty: Difficulty;
  name: string | null;
}

const bossReplySchema = z.object({ id: z.string() });

export function useCreateBoss() {
  const invalidate = useGymInvalidation();
  return useMutation({
    mutationFn: async (input: BossInput & { exerciseId: string }) => {
      const { data, error } = await supabase.rpc('create_boss', {
        p_exercise_id: input.exerciseId,
        p_target_weight_kg: input.targetWeightKg,
        p_target_reps: input.targetReps,
        p_difficulty: input.difficulty,
        p_name: input.name ?? '',
      });
      if (error) throw error;
      return bossReplySchema.parse(data);
    },
    onSettled: invalidate,
  });
}

export function useUpdateBoss() {
  const invalidate = useGymInvalidation();
  return useMutation({
    mutationFn: async (input: BossInput & { bossId: string }) => {
      const { data, error } = await supabase.rpc('update_boss', {
        p_boss_id: input.bossId,
        p_target_weight_kg: input.targetWeightKg,
        p_target_reps: input.targetReps,
        p_difficulty: input.difficulty,
        p_name: input.name ?? '',
      });
      if (error) throw error;
      return bossReplySchema.parse(data);
    },
    onSettled: invalidate,
  });
}

export function useArchiveBoss() {
  const invalidate = useGymInvalidation();
  return useMutation({
    mutationFn: async (bossId: string) => {
      const { data, error } = await supabase.rpc('archive_boss', { p_boss_id: bossId });
      if (error) throw error;
      return bossReplySchema.parse(data);
    },
    onSettled: invalidate,
  });
}

export function useSetRestTimer() {
  const invalidate = useGymInvalidation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (seconds: number) => {
      const { data, error } = await supabase.rpc('set_rest_timer', { p_seconds: seconds });
      if (error) throw error;
      return z.object({ rest_timer_s: z.coerce.number() }).parse(data).rest_timer_s;
    },
    onSettled: async () => {
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: hunterSnapshotKey }),
      ]);
    },
  });
}
