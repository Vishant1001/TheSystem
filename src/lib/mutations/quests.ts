import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { STAT_IDS } from '../../game';
import type { TablesInsert, TablesUpdate } from '../database.types';
import { hunterSnapshotKey } from '../queries/hunterSnapshot';
import { completionsKey, oneTimeCompletionsKey, questsKey } from '../queries/quests';
import { supabase } from '../supabase';

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
});

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
    onSuccess: async () => {
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
    onSuccess: async () => {
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
    onSuccess: async () => {
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
    onSuccess: async () => {
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
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: questsKey }),
        queryClient.invalidateQueries({ queryKey: hunterSnapshotKey }),
      ]);
    },
  });
}
