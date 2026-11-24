import { z } from 'zod';
import { EXERCISE_KINDS, type ExerciseKind, type SetType } from '../../game';

/**
 * The workout in progress (brief 4.6). Sets are collected on the phone and
 * sent to log_workout in one call when the hunter finishes, so the whole
 * workout - set XP, records, bosses - is awarded atomically. The draft lives
 * in localStorage so it survives navigation and a reload mid-session.
 *
 * Each exercise keeps an input row. It starts with the first set of the last
 * session, and after each logged set moves to the next set of that session -
 * or keeps the values just logged - so repeating last time is one tap per set.
 */

export interface DraftSet {
  id: string;
  setType: SetType;
  reps: number | null;
  weightKg: number | null;
  durationS: number | null;
  distanceM: number | null;
}

export interface DraftInputs {
  setType: SetType;
  reps: string;
  weight: string;
  minutes: string;
  distanceKm: string;
}

export interface DraftExercise {
  key: string;
  exerciseId: string;
  name: string;
  kind: ExerciseKind;
  /** The last session's sets, used to prefill the input row. */
  lastSets: DraftSet[];
  sets: DraftSet[];
  inputs: DraftInputs;
}

export interface WorkoutDraft {
  version: 1;
  userId: string;
  startedAt: number;
  title: string;
  exercises: DraftExercise[];
}

export interface ExerciseRef {
  id: string;
  name: string;
  kind: ExerciseKind;
}

/** Ids that work outside a secure context too (crypto.randomUUID does not). */
export function newDraftId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDraft(userId: string, startedAt: number, title: string): WorkoutDraft {
  return { version: 1, userId, startedAt, title, exercises: [] };
}

function numberText(value: number | null): string {
  return value === null ? '' : String(value);
}

/** The input row for a set to repeat, or an empty working set. */
export function inputsFrom(set: DraftSet | null): DraftInputs {
  if (set === null) {
    return { setType: 'working', reps: '', weight: '', minutes: '', distanceKm: '' };
  }
  return {
    setType: set.setType,
    reps: numberText(set.reps),
    weight: numberText(set.weightKg),
    minutes: set.durationS === null ? '' : String(Math.round((set.durationS / 60) * 100) / 100),
    distanceKm: set.distanceM === null ? '' : String(Math.round(set.distanceM) / 1000),
  };
}

export function addExercise(
  draft: WorkoutDraft,
  exercise: ExerciseRef,
  lastSets: DraftSet[],
  key: string,
): WorkoutDraft {
  return {
    ...draft,
    exercises: [
      ...draft.exercises,
      {
        key,
        exerciseId: exercise.id,
        name: exercise.name,
        kind: exercise.kind,
        lastSets,
        sets: [],
        inputs: inputsFrom(lastSets[0] ?? null),
      },
    ],
  };
}

function parseOptional(text: string): number | null | 'invalid' {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : 'invalid';
}

function twoDecimals(value: number): boolean {
  return Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
}

/**
 * The set the input row describes, or null when it is not a valid set.
 * Strength and mobility: reps 1-1000, optional weight 0-1000 kg (two
 * decimals). Cardio: a duration or a distance, reps optional.
 */
export function parseInputs(inputs: DraftInputs, kind: ExerciseKind, id: string): DraftSet | null {
  const reps = parseOptional(inputs.reps);
  const weight = parseOptional(inputs.weight);
  const minutes = parseOptional(inputs.minutes);
  const km = parseOptional(inputs.distanceKm);
  if (reps === 'invalid' || weight === 'invalid' || minutes === 'invalid' || km === 'invalid') {
    return null;
  }
  if (reps !== null && (!Number.isInteger(reps) || reps < 1 || reps > 1000)) return null;
  if (weight !== null && (weight < 0 || weight > 1000 || !twoDecimals(weight))) return null;

  if (kind === 'cardio') {
    const durationS = minutes === null ? null : Math.round(minutes * 60);
    const distanceM = km === null ? null : Math.round(km * 1000 * 100) / 100;
    if (durationS !== null && (durationS < 1 || durationS > 86_400)) return null;
    if (distanceM !== null && (distanceM <= 0 || distanceM > 1_000_000)) return null;
    if (durationS === null && distanceM === null && reps === null) return null;
    return { id, setType: inputs.setType, reps, weightKg: weight, durationS, distanceM };
  }

  if (reps === null) return null;
  return { id, setType: inputs.setType, reps, weightKg: weight, durationS: null, distanceM: null };
}

function mapExercise(
  draft: WorkoutDraft,
  key: string,
  change: (exercise: DraftExercise) => DraftExercise,
): WorkoutDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) =>
      exercise.key === key ? change(exercise) : exercise,
    ),
  };
}

/** Logs the input row as a set. Returns the logged set, or null if invalid. */
export function logSet(
  draft: WorkoutDraft,
  key: string,
  id: string,
): { draft: WorkoutDraft; logged: DraftSet | null } {
  const exercise = draft.exercises.find((candidate) => candidate.key === key);
  if (exercise === undefined) return { draft, logged: null };
  const logged = parseInputs(exercise.inputs, exercise.kind, id);
  if (logged === null) return { draft, logged: null };

  const next = mapExercise(draft, key, (current) => {
    const sets = [...current.sets, logged];
    const fromLastTime = current.lastSets[sets.length];
    return {
      ...current,
      sets,
      // Follow last session while it lasts, then repeat what was just logged.
      inputs: fromLastTime === undefined ? current.inputs : inputsFrom(fromLastTime),
    };
  });
  return { draft: next, logged };
}

export function updateInputs(
  draft: WorkoutDraft,
  key: string,
  patch: Partial<DraftInputs>,
): WorkoutDraft {
  return mapExercise(draft, key, (exercise) => ({
    ...exercise,
    inputs: { ...exercise.inputs, ...patch },
  }));
}

export function removeSet(draft: WorkoutDraft, key: string, setId: string): WorkoutDraft {
  return mapExercise(draft, key, (exercise) => ({
    ...exercise,
    sets: exercise.sets.filter((set) => set.id !== setId),
  }));
}

export function removeExercise(draft: WorkoutDraft, key: string): WorkoutDraft {
  return { ...draft, exercises: draft.exercises.filter((exercise) => exercise.key !== key) };
}

export function loggedSetCount(draft: WorkoutDraft): number {
  return draft.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
}

/** The log_workout payload (2.6 shape), exercise by exercise, in log order. */
export function toPayload(draft: WorkoutDraft) {
  return draft.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => ({
      exercise_id: exercise.exerciseId,
      set_type: set.setType,
      reps: set.reps,
      weight_kg: set.weightKg,
      duration_s: set.durationS,
      distance_m: set.distanceM,
    })),
  );
}

// ---------------------------------------------------------------------------
// Persistence. Anything unreadable is treated as no draft.
// ---------------------------------------------------------------------------
export const DRAFT_STORAGE_KEY = 'system.workoutDraft.v1';

const setSchema = z.object({
  id: z.string(),
  setType: z.enum(['warmup', 'working']),
  reps: z.number().nullable(),
  weightKg: z.number().nullable(),
  durationS: z.number().nullable(),
  distanceM: z.number().nullable(),
});

const draftSchema = z.object({
  version: z.literal(1),
  userId: z.string(),
  startedAt: z.number(),
  title: z.string(),
  exercises: z.array(
    z.object({
      key: z.string(),
      exerciseId: z.string(),
      name: z.string(),
      kind: z.enum(EXERCISE_KINDS),
      lastSets: z.array(setSchema),
      sets: z.array(setSchema),
      inputs: z.object({
        setType: z.enum(['warmup', 'working']),
        reps: z.string(),
        weight: z.string(),
        minutes: z.string(),
        distanceKm: z.string(),
      }),
    }),
  ),
});

export interface DraftStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export function loadDraft(storage: DraftStorage, userId: string): WorkoutDraft | null {
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.userId !== userId) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function saveDraft(storage: DraftStorage, draft: WorkoutDraft | null): void {
  try {
    if (draft === null) storage.removeItem(DRAFT_STORAGE_KEY);
    else storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage full or blocked: the draft still lives in memory.
  }
}
