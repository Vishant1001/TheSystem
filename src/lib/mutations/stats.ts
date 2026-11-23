import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StatId } from '../../game';
import { hunterSnapshotKey } from '../queries/hunterSnapshot';
import { supabase } from '../supabase';

/**
 * ADR-5: the engine checks availability client-side before this is called, and
 * RLS keeps the row owned by the caller. Allocation is permanent, so the UI
 * confirms first.
 */
export function useAllocatePoints() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ stat, points }: { stat: StatId; points: number }) => {
      const { error } = await supabase.rpc('allocate_points', {
        p_stat: stat,
        p_points: points,
      });
      if (error) throw error;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: hunterSnapshotKey });
    },
  });
}
