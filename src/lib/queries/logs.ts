import { useQuery } from '@tanstack/react-query';
import type { Tables } from '../database.types';
import { supabase } from '../supabase';

export type FoodEntryRow = Tables<'food_entries'>;
export type WorkoutSetRow = Tables<'workout_sets'>;
export type WorkoutRow = Tables<'workouts'> & { workout_sets: WorkoutSetRow[] };

export const foodKey = (day: string) => ['food-entries', day] as const;
export const workoutsKey = (day: string) => ['workouts', day] as const;

export async function fetchFood(day: string): Promise<FoodEntryRow[]> {
  const { data, error } = await supabase
    .from('food_entries')
    .select('*')
    .eq('occurred_on', day)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchWorkouts(day: string): Promise<WorkoutRow[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('*, workout_sets(*)')
    .eq('occurred_on', day)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map((workout) => ({
    ...workout,
    workout_sets: [...workout.workout_sets].sort((a, b) => a.set_index - b.set_index),
  }));
}

export function useFood(day: string | undefined) {
  return useQuery({
    queryKey: foodKey(day ?? 'unknown'),
    queryFn: () => fetchFood(day ?? ''),
    enabled: day !== undefined,
  });
}

export function useWorkouts(day: string | undefined) {
  return useQuery({
    queryKey: workoutsKey(day ?? 'unknown'),
    queryFn: () => fetchWorkouts(day ?? ''),
    enabled: day !== undefined,
  });
}

export interface DayTotals {
  kcal: number;
  proteinG: number;
}

export function sumFood(entries: FoodEntryRow[] | undefined): DayTotals {
  if (entries === undefined) return { kcal: 0, proteinG: 0 };
  return entries.reduce<DayTotals>(
    (totals, entry) => ({
      kcal: totals.kcal + entry.kcal,
      proteinG: totals.proteinG + Number(entry.protein_g),
    }),
    { kcal: 0, proteinG: 0 },
  );
}

export type KcalStatus = 'empty' | 'below' | 'in_range' | 'over';

/**
 * Brief 5.8: the calorie quest is only judged at day close, so the board shows
 * a live status all day and settles nothing until then.
 */
export function kcalStatus(kcal: number, min: number, max: number): KcalStatus {
  if (kcal <= 0) return 'empty';
  if (kcal < min) return 'below';
  if (kcal > max) return 'over';
  return 'in_range';
}
