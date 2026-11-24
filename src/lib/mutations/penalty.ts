import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';

/**
 * Penalty Zone mutations (brief 3.5, 3.6). Every one of them can change the
 * ledger, the quest board (a trial appears or is removed) and the gates, so
 * all of them re-read everything in onSettled - success or failure, since
 * the server may have committed even when the reply was lost.
 */
function useInvalidateAll() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries();
  };
}

export type PenaltyChoice = 'trial' | 'debt' | 'weakened';

export function useChoosePenalty() {
  const invalidateAll = useInvalidateAll();
  return useMutation({
    mutationFn: async (choice: PenaltyChoice) => {
      const { error } = await supabase.rpc('choose_penalty', { p_choice: choice });
      if (error) throw error;
    },
    onSettled: invalidateAll,
  });
}

export function useAcknowledgePenalty() {
  const invalidateAll = useInvalidateAll();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('acknowledge_penalty');
      if (error) throw error;
    },
    onSettled: invalidateAll,
  });
}

export function useRedeemPenalty() {
  const invalidateAll = useInvalidateAll();
  return useMutation({
    mutationFn: async (penaltyId: string) => {
      const { error } = await supabase.rpc('redeem_penalty', { p_penalty_id: penaltyId });
      if (error) throw error;
    },
    onSettled: invalidateAll,
  });
}
