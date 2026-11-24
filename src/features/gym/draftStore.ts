import { useSyncExternalStore } from 'react';
import { useAuth } from '../auth/authContext';
import { DRAFT_STORAGE_KEY, loadDraft, saveDraft, type WorkoutDraft } from './workoutDraft';

/**
 * The workout draft as a live value, so screens other than the logger (the
 * Train quest row, the penalty warning, the Log tab) react the moment a draft
 * appears or is finished. Persistence stays in workoutDraft.ts.
 */

const listeners = new Set<() => void>();

function storage() {
  return window.localStorage;
}

function rawDraft(): string | null {
  try {
    return storage().getItem(DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === DRAFT_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Saves (or clears, with null) the draft and tells every subscriber. */
export function persistDraft(draft: WorkoutDraft | null): void {
  saveDraft(storage(), draft);
  for (const listener of listeners) listener();
}

export function readDraft(userId: string): WorkoutDraft | null {
  return loadDraft(storage(), userId);
}

/** The signed-in hunter's unfinished workout, or null. */
export function useWorkoutDraft(): WorkoutDraft | null {
  const { session } = useAuth();
  const raw = useSyncExternalStore(subscribe, rawDraft, () => null);
  const userId = session?.user.id;
  if (raw === null || userId === undefined) return null;
  return readDraft(userId);
}
