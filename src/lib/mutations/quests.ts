import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { systemCopy } from '../../copy/system';
import { STAT_IDS } from '../../game';
import type { TablesInsert, TablesUpdate } from '../database.types';
import { hunterSnapshotKey } from '../queries/hunterSnapshot';
import { completionsKey, oneTimeCompletionsKey, questsKey } from '../queries/quests';
import { supabase } from '../supabase';
import { errorToken } from '../systemError';
import { runDayClose } from '../../features/report/useDayClose';

export const questAwardSchema = z.object({
  completion_id: z.string(),
  event_id: z.string(),
  quest_id: z.string(),
  quest_title: z.string(),
  occurred_on: z.string(),
  category: z.string(),
  xp: z.coerce.number(),
  full_xp: z.coerce.number(),
  capped: z.boolean(),
  stat_xp: z.object({
    STR: z.coerce.number(),
    AGI: z.coerce.number(),
    VIT: z.coerce.number(),
    INT: z.coerce.number(),
    SENSE: z.coerce.number(),
  }),
  /** Brief 3.4: the part of this award diverted to an XP Debt (Phase 2). */
  debt_repayment: z.coerce.number().default(0),
  weakened: z.boolean().default(false),
});

/** Extra toast lines for the Penalty Zone modifiers on an award. */
export function modifierLines(award: QuestAward): string[] {
  const lines: string[] = [];
  if (award.debt_repayment > 0) lines.push(systemCopy.quests.repaid(award.debt_repayment));
  if (award.weakened) lines.push(systemCopy.quests.weakenedZeroed);
  return lines;
}

export type QuestAward = z.infer<typeof questAwardSchema>;

/** The stats that actually moved, for the completion toast (brief 7.3). */
export function awardedStats(award: QuestAward): { id: string; amount: number }[] {
  return STAT_IDS.map((id) => ({ id, amount: award.stat_xp[id] })).filter(
    (entry) => entry.amount !== 0,
  );
}

/** Everything a ledger write can change (brief 7.4). */
function useLedgerInvalidation() {
  const queryClient = useQueryClient();
  return async (day: string | undefined) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: hunterSnapshotKey }),
      queryClient.invalidateQueries({ queryKey: questsKey }),
      queryClient.invalidateQueries({ queryKey: oneTimeCompletionsKey }),
      day === undefined
        ? Promise.resolve()
        : queryClient.invalidateQueries({ queryKey: completionsKey(day) }),
    ]);
  };
}

export function useCompleteQuest(day: string | undefined) {
  const invalidate = useLedgerInvalidation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ questId, value }: { questId: string; value: number | null }) => {
      // p_value defaults in SQL, so a boolean quest simply omits it.
      const { data, error } = await supabase.rpc('complete_quest', {
        p_quest_id: questId,
        ...(value === null ? {} : { p_value: value }),
      });
      if (error) throw error;
      return questAwardSchema.parse(data);
    },
    onSettled: async (_data, error) => {
      // An expired trial is refused, and the refusal rolls back the escalation
      // the server started (step 2.3). Close the days now so the escalated
      // debt and its acknowledgement screen appear immediately.
      if (errorToken(error) === 'TRIAL_EXPIRED') {
        await runDayClose(queryClient).catch(() => undefined);
        return;
      }
      await invalidate(day);
    },
  });
}

export function useUndoCompletion(day: string | undefined) {
  const invalidate = useLedgerInvalidation();

  return useMutation({
    mutationFn: async (completionId: string) => {
      const { error } = await supabase.rpc('undo_completion', {
        p_completion_id: completionId,
      });
      if (error) throw error;
    },
    onSettled: async () => {
      await invalidate(day);
    },
  });
}

export function useCreateQuest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (quest: TablesInsert<'quests'>) => {
      const { data, error } = await supabase.from('quests').insert(quest).select().single();
      if (error) throw error;
      return data;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: questsKey });
    },
  });
}

export function useUpdateQuest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'quests'> }) => {
      const { data, error } = await supabase
        .from('quests')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: questsKey });
    },
  });
}

/** Archive rather than delete, so history keeps its meaning (brief 7.2). */
export function useArchiveQuest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('quests')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: questsKey }),
        queryClient.invalidateQueries({ queryKey: hunterSnapshotKey }),
      ]);
    },
  });
}
