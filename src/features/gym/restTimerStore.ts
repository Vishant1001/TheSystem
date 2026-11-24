import { useSyncExternalStore } from 'react';
import { adjustRestSeconds, clampRestSeconds } from '../../game';

/**
 * The rest timer (brief 4.6) persists its start instant and duration in
 * localStorage, so it survives navigation inside the app and a reload; the
 * remaining time is always derived from the clock (restTimerState).
 */

export interface RestTimer {
  startedAt: number;
  durationS: number;
  /** The finish vibration already fired. */
  notified: boolean;
}

export const REST_TIMER_STORAGE_KEY = 'system.restTimer.v1';

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedTimer: RestTimer | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(REST_TIMER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function parseRestTimer(raw: string | null): RestTimer | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      'startedAt' in value &&
      'durationS' in value &&
      typeof value.startedAt === 'number' &&
      typeof value.durationS === 'number'
    ) {
      const notified = 'notified' in value && value.notified === true;
      return { startedAt: value.startedAt, durationS: value.durationS, notified };
    }
  } catch {
    // Unreadable: no timer.
  }
  return null;
}

function snapshot(): RestTimer | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedTimer = parseRestTimer(raw);
  }
  return cachedTimer;
}

function write(timer: RestTimer | null): void {
  try {
    if (timer === null) window.localStorage.removeItem(REST_TIMER_STORAGE_KEY);
    else window.localStorage.setItem(REST_TIMER_STORAGE_KEY, JSON.stringify(timer));
  } catch {
    // Blocked storage: nothing to persist to.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === REST_TIMER_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useRestTimer(): RestTimer | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

export function startRestTimer(nowMs: number, seconds: number): void {
  write({ startedAt: nowMs, durationS: clampRestSeconds(seconds), notified: false });
}

/** Starts the timer from this instant (called from event handlers). */
export function startRestTimerNow(seconds: number): void {
  startRestTimer(Date.now(), seconds);
}

/** The +/- buttons: one configured step either way, within the limits. */
export function adjustRunningTimer(steps: number): void {
  const timer = snapshot();
  if (timer === null) return;
  write({ ...timer, durationS: adjustRestSeconds(timer.durationS, steps), notified: false });
}

export function markRestTimerNotified(): void {
  const timer = snapshot();
  if (timer !== null && !timer.notified) write({ ...timer, notified: true });
}

export function stopRestTimer(): void {
  write(null);
}
