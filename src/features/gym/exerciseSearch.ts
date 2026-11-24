import type { ExerciseKind } from '../../game';

/**
 * The exercise picker's search (brief 4.6: name, muscle and equipment
 * filters). Ordering, from the 2.5 review: the hunter's own exercises with
 * history first, then library exercises they have used, then the rest of the
 * library, then their unused custom exercises.
 */

export interface SearchableExercise {
  id: string;
  user_id: string | null;
  name: string;
  kind: ExerciseKind;
  equipment: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
  archived_at: string | null;
}

export interface ExerciseSummary {
  exercise_id: string;
  set_count: number;
  last_on: string;
}

export interface SearchOptions {
  query: string;
  muscle: string | null;
  equipment: string | null;
  /** Only these kinds (bosses: strength; a merge: the source's kind). */
  kinds?: readonly ExerciseKind[] | undefined;
  /** Never offer this exercise (a merge cannot target its own source). */
  excludeId?: string | undefined;
  /** Library exercises only. */
  libraryOnly?: boolean | undefined;
  limit?: number | undefined;
}

export interface SearchHit<T extends SearchableExercise> {
  exercise: T;
  summary: ExerciseSummary | null;
}

function rankGroup(exercise: SearchableExercise, summary: ExerciseSummary | null): number {
  const custom = exercise.user_id !== null;
  if (summary !== null) return custom ? 0 : 1;
  return custom ? 3 : 2;
}

export function searchExercises<T extends SearchableExercise>(
  exercises: readonly T[],
  summaries: ReadonlyMap<string, ExerciseSummary>,
  options: SearchOptions,
): SearchHit<T>[] {
  const tokens = options.query.toLowerCase().split(/\s+/).filter(Boolean);
  const query = tokens.join(' ');

  const hits = exercises
    .filter((exercise) => {
      if (exercise.archived_at !== null) return false;
      if (exercise.id === options.excludeId) return false;
      if (options.libraryOnly === true && exercise.user_id !== null) return false;
      if (options.kinds !== undefined && !options.kinds.includes(exercise.kind)) return false;
      if (options.equipment !== null && exercise.equipment !== options.equipment) return false;
      if (
        options.muscle !== null &&
        !exercise.primary_muscles.includes(options.muscle) &&
        !exercise.secondary_muscles.includes(options.muscle)
      ) {
        return false;
      }
      const name = exercise.name.toLowerCase();
      return tokens.every((token) => name.includes(token));
    })
    .map((exercise) => ({ exercise, summary: summaries.get(exercise.id) ?? null }));

  hits.sort((a, b) => {
    const group = rankGroup(a.exercise, a.summary) - rankGroup(b.exercise, b.summary);
    if (group !== 0) return group;
    if (a.summary !== null && b.summary !== null && a.summary.last_on !== b.summary.last_on) {
      return a.summary.last_on < b.summary.last_on ? 1 : -1;
    }
    if (query !== '') {
      const aStarts = a.exercise.name.toLowerCase().startsWith(query);
      const bStarts = b.exercise.name.toLowerCase().startsWith(query);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
    }
    return a.exercise.name.localeCompare(b.exercise.name);
  });

  return options.limit === undefined ? hits : hits.slice(0, options.limit);
}

/** The muscle and equipment filter options present in the data, sorted. */
export function facetOptions(exercises: readonly SearchableExercise[]): {
  muscles: string[];
  equipment: string[];
} {
  const muscles = new Set<string>();
  const equipment = new Set<string>();
  for (const exercise of exercises) {
    for (const muscle of exercise.primary_muscles) muscles.add(muscle);
    if (exercise.equipment !== null) equipment.add(exercise.equipment);
  }
  return { muscles: [...muscles].sort(), equipment: [...equipment].sort() };
}
