import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { EXERCISE_KINDS, GAME_CONFIG } from '../../game';
import type { ExerciseSummary } from '../../features/gym/exerciseSearch';
import type { Tables } from '../database.types';
import { supabase } from '../supabase';

/** Every gym query lives under this key, so a workout write refreshes them all. */
export const gymKey = ['gym'] as const;
export const exercisesKey = [...gymKey, 'exercises'] as const;
export const exerciseSummariesKey = [...gymKey, 'summaries'] as const;
export const exerciseSessionsKey = (exerciseId: string) =>
  [...gymKey, 'sessions', exerciseId] as const;
export const personalRecordsKey = (exerciseId: string) =>
  [...gymKey, 'records', exerciseId] as const;
export const bossesKey = [...gymKey, 'bosses'] as const;
export const restTimerKey = [...gymKey, 'rest-timer'] as const;

const exerciseSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  name: z.string(),
  kind: z.enum(EXERCISE_KINDS),
  category: z.string().nullable(),
  equipment: z.string().nullable(),
  primary_muscles: z.array(z.string()),
  secondary_muscles: z.array(z.string()),
  archived_at: z.string().nullable(),
  merged_into_id: z.string().nullable(),
});
export type Exercise = z.infer<typeof exerciseSchema>;

const PAGE = 1000;

/**
 * The library (876 rows) and the hunter's custom exercises, fetched once and
 * searched on the phone. Paged, because the API returns at most 1000 rows.
 */
export async function fetchExercises(): Promise<Exercise[]> {
  const rows: Exercise[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('exercises')
      .select(
        'id, user_id, name, kind, category, equipment, primary_muscles, secondary_muscles, archived_at, merged_into_id',
      )
      .order('name')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...z.array(exerciseSchema).parse(data));
    if (data.length < PAGE) return rows;
  }
}

export function useExercises() {
  return useQuery({
    queryKey: exercisesKey,
    queryFn: fetchExercises,
    staleTime: 10 * 60_000,
  });
}

const summarySchema = z.object({
  exercise_id: z.string(),
  set_count: z.coerce.number(),
  last_on: z.string(),
});

export function useExerciseSummaries() {
  return useQuery({
    queryKey: exerciseSummariesKey,
    queryFn: async (): Promise<Map<string, ExerciseSummary>> => {
      const { data, error } = await supabase.rpc('exercise_summaries');
      if (error) throw error;
      const list = z.array(summarySchema).parse(data);
      return new Map(list.map((summary) => [summary.exercise_id, summary]));
    },
  });
}

export type WorkoutSetRow = Tables<'workout_sets'>;

export interface ExerciseSession {
  workout_id: string;
  occurred_on: string;
  title: string;
  created_at: string;
  sets: WorkoutSetRow[];
}

/** The hunter's sessions of one exercise, newest first (history and prefill). */
export async function fetchExerciseSessions(
  exerciseId: string,
  limit = 30,
): Promise<ExerciseSession[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, occurred_on, title, created_at, workout_sets!inner(*)')
    .eq('workout_sets.exercise_id', exerciseId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((workout) => ({
    workout_id: workout.id,
    occurred_on: workout.occurred_on,
    title: workout.title,
    created_at: workout.created_at,
    sets: [...workout.workout_sets].sort((a, b) => a.set_index - b.set_index),
  }));
}

export function useExerciseSessions(exerciseId: string | undefined) {
  return useQuery({
    queryKey: exerciseSessionsKey(exerciseId ?? 'none'),
    queryFn: () => fetchExerciseSessions(exerciseId ?? ''),
    enabled: exerciseId !== undefined,
  });
}

export interface RecordBests {
  e1rm: number | null;
  maxWeight: number | null;
}

/** The current best per record kind, derived from live records (brief 4.4). */
export function usePersonalRecords(exerciseId: string | undefined) {
  return useQuery({
    queryKey: personalRecordsKey(exerciseId ?? 'none'),
    enabled: exerciseId !== undefined,
    queryFn: async (): Promise<RecordBests> => {
      const { data, error } = await supabase
        .from('personal_records')
        .select('pr_kind, value_centi')
        .eq('exercise_id', exerciseId ?? '')
        .is('reversed_at', null);
      if (error) throw error;
      const best = (kind: string) =>
        data
          .filter((row) => row.pr_kind === kind)
          .reduce<number | null>((top, row) => Math.max(top ?? 0, row.value_centi), null);
      return { e1rm: best('e1rm'), maxWeight: best('max_weight') };
    },
  });
}

// boss_json is an internal SQL helper that the type generator lists as a
// computed field; it is never selected.
export type BossRow = Omit<Tables<'bosses'>, 'boss_json'> & { exercises: { name: string } | null };

export function useBosses() {
  return useQuery({
    queryKey: bossesKey,
    queryFn: async (): Promise<BossRow[]> => {
      const { data, error } = await supabase
        .from('bosses')
        .select('*, exercises(name)')
        .is('archived_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

/** The hunter's rest timer default; null in the record means the config default. */
export function useRestTimerSetting() {
  return useQuery({
    queryKey: restTimerKey,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.from('hunters').select('rest_timer_s').single();
      if (error) throw error;
      return data.rest_timer_s ?? GAME_CONFIG.gym.restTimer.defaultSeconds;
    },
  });
}
