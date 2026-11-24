import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { hunterSnapshotKey } from './hunterSnapshot';
import { supabase } from '../supabase';

export const reportDaySchema = z.object({
  log_date: z.string(),
  status: z.enum(['cleared', 'failed', 'rest', 'safe']),
  core_total: z.coerce.number(),
  core_done: z.coerce.number(),
  xp_gained: z.coerce.number(),
  free_points_gained: z.coerce.number(),
  // Phase 2 (3.6): the streak after the close, and whether it earned a stone.
  streak: z.coerce.number(),
  stone_earned: z.boolean(),
});

export type ReportDay = z.infer<typeof reportDaySchema>;

export const pendingReportSchema = z.object({ days: z.array(reportDaySchema) });

export const closeDaysSchema = z.object({
  game_today: z.string(),
  count: z.coerce.number(),
  more_pending: z.boolean(),
  days: z.array(reportDaySchema),
});

export const pendingReportKey = ['pending-report'] as const;

export async function fetchPendingReport(): Promise<ReportDay[]> {
  const { data, error } = await supabase.rpc('pending_report');
  if (error) throw error;
  return pendingReportSchema.parse(data).days;
}

export function usePendingReport() {
  return useQuery({ queryKey: pendingReportKey, queryFn: fetchPendingReport });
}

export function useAcknowledgeReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('acknowledge_report');
      if (error) throw error;
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pendingReportKey }),
        queryClient.invalidateQueries({ queryKey: hunterSnapshotKey }),
      ]);
    },
  });
}
