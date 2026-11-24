import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PenaltyMode, SafeKind } from '../../game';
import { hunterSnapshotKey } from '../queries/hunterSnapshot';
import { supabase } from '../supabase';

/** Safe Zones settings (brief 3.1, 3.7, 3.8). All re-sync the snapshot. */
function useInvalidateSnapshot() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: hunterSnapshotKey });
  };
}

export function useUpdateRules() {
  const invalidate = useInvalidateSnapshot();
  return useMutation({
    mutationFn: async ({ mode, restDays }: { mode: PenaltyMode; restDays: number[] }) => {
      const { error } = await supabase.rpc('update_hunter_rules', {
        p_penalty_mode: mode,
        p_rest_days: restDays,
      });
      if (error) throw error;
    },
    onSettled: invalidate,
  });
}

export function useStartSafePeriod() {
  const invalidate = useInvalidateSnapshot();
  return useMutation({
    mutationFn: async ({ kind, days }: { kind: SafeKind; days: number }) => {
      const { error } = await supabase.rpc('start_safe_period', { p_kind: kind, p_days: days });
      if (error) throw error;
    },
    onSettled: invalidate,
  });
}

export function useEndSafePeriod() {
  const invalidate = useInvalidateSnapshot();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('end_safe_period', { p_id: id });
      if (error) throw error;
    },
    onSettled: invalidate,
  });
}
