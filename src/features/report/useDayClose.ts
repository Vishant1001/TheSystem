import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { closeDaysSchema } from '../../lib/queries/report';
import { supabase } from '../../lib/supabase';

/** G8: close_days() settles at most 30 days per call, so call it until caught up. */
const MAX_CALLS = 3;

export type DayCloseState = 'idle' | 'closing' | 'done' | 'failed';

/**
 * ADR-7: lazy day close. Runs once per app load, before the hunter sees
 * anything, and is safe to call repeatedly - the function itself is idempotent.
 *
 * It does not decide what to show: the snapshot's unacknowledged_days drives
 * the System Report, so a hunter who closes the app mid-report still gets it
 * on the next load (G9).
 */
export function useDayClose(enabled: boolean): DayCloseState {
  const queryClient = useQueryClient();
  const started = useRef(false);
  const [state, setState] = useState<DayCloseState>('idle');

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;

    const run = async () => {
      setState('closing');
      try {
        for (let call = 0; call < MAX_CALLS; call += 1) {
          const { data, error } = await supabase.rpc('close_days');
          if (error) throw error;
          const result = closeDaysSchema.parse(data);
          if (!result.more_pending) break;
        }
        setState('done');
      } catch {
        // A failed close must not block the app: the next load tries again.
        setState('failed');
      } finally {
        // Closing a day writes to the ledger, so everything is re-read.
        await queryClient.invalidateQueries();
      }
    };

    void run();
  }, [enabled, queryClient]);

  return state;
}
