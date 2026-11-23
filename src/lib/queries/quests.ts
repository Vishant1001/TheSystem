import { useQuery } from '@tanstack/react-query';
import { isOverdue, isScheduledOn, type ScheduleInput } from '../../game';
import { gameDateAt } from '../../game';
import type { Tables } from '../database.types';
import { supabase } from '../supabase';

export type QuestRow = Tables<'quests'>;
export type QuestCompletionRow = Tables<'quest_completions'>;

export const questsKey = ['quests'] as const;
export const completionsKey = (day: string) => ['quest-completions', day] as const;
export const oneTimeCompletionsKey = ['quest-completions', 'one-time'] as const;

export async function fetchQuests(): Promise<QuestRow[]> {
  const { data, error } = await supabase
    .from('quests')
    .select('*')
    .is('archived_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchCompletions(day: string): Promise<QuestCompletionRow[]> {
  const { data, error } = await supabase
    .from('quest_completions')
    .select('*')
    .eq('occurred_on', day)
    .is('reversed_at', null);
  if (error) throw error;
  return data;
}

/**
 * Live completions of one-time quests, whatever day they happened on. Without
 * this a one-time quest finished last week would look outstanding again today,
 * since the day query only covers today.
 */
export async function fetchOneTimeCompletions(): Promise<QuestCompletionRow[]> {
  const { data, error } = await supabase
    .from('quest_completions')
    .select('*, quests!inner(type)')
    .eq('quests.type', 'one_time')
    .is('reversed_at', null);
  if (error) throw error;
  return data.map(({ quests: _quests, ...completion }) => completion);
}

export function useQuests() {
  return useQuery({ queryKey: questsKey, queryFn: fetchQuests });
}

export function useCompletions(day: string | undefined) {
  return useQuery({
    queryKey: completionsKey(day ?? 'unknown'),
    queryFn: () => fetchCompletions(day ?? ''),
    enabled: day !== undefined,
  });
}

export function useOneTimeCompletions() {
  return useQuery({ queryKey: oneTimeCompletionsKey, queryFn: fetchOneTimeCompletions });
}

export interface QuestView {
  quest: QuestRow;
  /** Today's live completion, if there is one. */
  completion: QuestCompletionRow | null;
  isDone: boolean;
  isAuto: boolean;
  /** count / duration / numeric goals need a value before they can be completed. */
  needsValue: boolean;
  overdue: boolean;
}

export interface QuestBoard {
  daily: QuestView[];
  oneTime: QuestView[];
}

function toScheduleInput(quest: QuestRow, timezone: string): ScheduleInput {
  return {
    type: quest.type === 'one_time' ? 'one_time' : 'daily',
    scheduleDays: quest.schedule_days,
    dueOn: quest.due_on,
    createdOn: gameDateAt(new Date(quest.created_at), timezone),
    archivedOn:
      quest.archived_at === null ? null : gameDateAt(new Date(quest.archived_at), timezone),
  };
}

/**
 * Composes the board the Quests screen renders: daily quests scheduled for
 * today with core first, and every outstanding one-time quest below.
 *
 * Scheduling uses the same predicate the database applies when it tallies a
 * day (src/game/schedule.ts), so the list and the day close cannot disagree.
 */
export function buildQuestBoard(
  quests: QuestRow[],
  completions: QuestCompletionRow[],
  day: string,
  timezone: string,
): QuestBoard {
  // A quest can appear twice here (today's completion and, for a one-time
  // quest, an older live one). Today's always wins, so a quest finished today
  // still offers Undo.
  const completionByQuest = new Map<string, QuestCompletionRow>();
  for (const row of completions) {
    const existing = completionByQuest.get(row.quest_id);
    if (existing === undefined || row.occurred_on === day) {
      completionByQuest.set(row.quest_id, row);
    }
  }

  const toView = (quest: QuestRow): QuestView => {
    const completion = completionByQuest.get(quest.id) ?? null;
    const isDone = completion !== null;
    return {
      quest,
      completion,
      isDone,
      isAuto: quest.tracking !== 'manual',
      needsValue: quest.goal_type !== 'boolean' && quest.tracking === 'manual',
      overdue: isOverdue(toScheduleInput(quest, timezone), day, isDone),
    };
  };

  const daily = quests
    .filter(
      (quest) => quest.type === 'daily' && isScheduledOn(toScheduleInput(quest, timezone), day),
    )
    .map(toView)
    .sort((a, b) => {
      if (a.quest.is_core !== b.quest.is_core) return a.quest.is_core ? -1 : 1;
      return a.quest.sort_order - b.quest.sort_order;
    });

  // One-time quests stay listed until they are done, whatever their due date.
  // One finished on an earlier day drops off the board entirely.
  const oneTime = quests
    .filter((quest) => quest.type === 'one_time')
    .map(toView)
    .filter((view) => !view.isDone || view.completion?.occurred_on === day)
    .sort((a, b) => {
      const left = a.quest.due_on ?? '9999-12-31';
      const right = b.quest.due_on ?? '9999-12-31';
      if (left !== right) return left < right ? -1 : 1;
      return a.quest.sort_order - b.quest.sort_order;
    });

  return { daily, oneTime };
}
