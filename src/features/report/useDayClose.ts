import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { penaltyCountdown } from '../../game';
import { closeDaysSchema } from '../../lib/queries/report';
import { hunterSnapshotKey, useHunterSnapshot } from '../../lib/queries/hunterSnapshot';
import { supabase } from '../../lib/supabase';

/** G8: close_days() settles at most 30 days per call, so call it until caught up. */
const MAX_CALLS = 3;

/** A little past the rollover, so the server agrees the new day has begun. */
const ROLLOVER_GRACE_MS = 2000;

export type DayCloseState = 'idle' | 'closing' | 'done' | 'failed';

/**
 * Runs close_days() until caught up, then re-reads everything: closing a day
 * writes to the ledger, and an implicit close inside an award RPC may already
 * have done so. The snapshot's `attention` block then drives the gates
 * (Report -> Penalty -> Level-up), so nothing here decides what to show.
 */
export async function runDayClose(queryClient: QueryClient): Promise<void> {
  try {
    for (let call = 0; call < MAX_CALLS; call += 1) {
      const { data, error } = await supabase.rpc('close_days');
      if (error) throw error;
      if (!closeDaysSchema.parse(data).more_pending) break;
    }
  } finally {
    await queryClient.invalidateQueries();
  }
}

/**
 * ADR-7: lazy day close. Runs once per app load before the hunter sees
 * anything (the returned state drives the loading screen), and again - in the
 * background - whenever the app returns to the foreground and when an open
 * app crosses the 03:00 rollover (step 2.3 review). close_days() is
 * idempotent, so extra calls cost nothing.
 */
export function useDayClose(enabled: boolean): DayCloseState {
  const queryClient = useQueryClient();
  const started = useRef(false);
  const running = useRef(false);
  const [state, setState] = useState<DayCloseState>('idle');
  const { data: snapshot } = useHunterSnapshot();

  const closeInBackground = useCallback(() => {
    if (running.current) return;
    running.current = true;
    void runDayClose(queryClient)
      .catch(() => {
        // The next trigger tries again; a failed close never blocks the app.
      })
      .finally(() => {
        running.current = false;
      });
  }, [queryClient]);

  // First load: blocking.
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    running.current = true;
    setState('closing');
    runDayClose(queryClient)
      .then(() => {
        setState('done');
      })
      .catch(() => {
        setState('failed');
      })
      .finally(() => {
        running.current = false;
      });
  }, [enabled, queryClient]);

  // Back to the foreground.
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') closeInBackground();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, closeInBackground]);

  // Crossing the rollover while the app stays open.
  const timezone = snapshot?.hunter.timezone;
  const mode = snapshot?.safe_zones.rules_today.penalty_mode;
  const gameToday = snapshot?.game_today;
  useEffect(() => {
    if (!enabled || timezone === undefined || mode === undefined) return;
    const { dayEndsAt } = penaltyCountdown(new Date(), timezone, mode);
    const delay = Math.max(0, dayEndsAt.getTime() - Date.now()) + ROLLOVER_GRACE_MS;
    // Browsers cap timers at ~24.8 days; a game day is at most 25 hours.
    const timer = window.setTimeout(() => {
      closeInBackground();
      void queryClient.invalidateQueries({ queryKey: hunterSnapshotKey });
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [enabled, timezone, mode, gameToday, closeInBackground, queryClient]);

  return state;
}
