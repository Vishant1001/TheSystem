import { useMemo } from 'react';
import type { HunterSnapshot } from '../../lib/schemas';
import {
  buildQuestBoard,
  coreRemainingToday,
  useCompletions,
  useOneTimeCompletions,
  useQuests,
  type QuestBoard,
} from '../../lib/queries/quests';

export interface TodayBoard {
  board: QuestBoard | null;
  /** Core quests still open today, by the close_days tally rule (3.2, 3.7). */
  coreRemaining: number;
  isPending: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Today's quest board for whichever screen needs it (Quests, Status warning). */
export function useTodayBoard(snapshot: HunterSnapshot | null | undefined): TodayBoard {
  const day = snapshot?.game_today;
  const timezone = snapshot?.hunter.timezone ?? 'UTC';
  const restDay = snapshot?.safe_zones.is_rest_day_today ?? false;

  const quests = useQuests();
  const completions = useCompletions(day);
  const oneTimeCompletions = useOneTimeCompletions();

  const board = useMemo(() => {
    if (quests.data === undefined || completions.data === undefined || day === undefined) {
      return null;
    }
    return buildQuestBoard(
      quests.data,
      [...completions.data, ...(oneTimeCompletions.data ?? [])],
      day,
      timezone,
    );
  }, [quests.data, completions.data, oneTimeCompletions.data, day, timezone]);

  const coreRemaining =
    board === null || day === undefined ? 0 : coreRemainingToday(board, day, timezone, restDay);

  return {
    board,
    coreRemaining,
    isPending: quests.isPending || completions.isPending,
    error: quests.error ?? completions.error ?? oneTimeCompletions.error,
    refetch: () => {
      void quests.refetch();
      void completions.refetch();
      void oneTimeCompletions.refetch();
    },
  };
}
