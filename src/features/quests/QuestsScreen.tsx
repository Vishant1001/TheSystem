import { useMemo } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { SystemLink } from '../../components/SystemLink';
import { SystemWindow } from '../../components/SystemWindow';
import { PlusIcon } from '../../components/icons';
import { useToast } from '../../components/toastContext';
import { systemCopy } from '../../copy/system';
import { awardedStats, useCompleteQuest, useUndoCompletion } from '../../lib/mutations/quests';
import { useHunterSnapshot } from '../../lib/queries/hunterSnapshot';
import { kcalStatus, sumFood, useFood } from '../../lib/queries/logs';
import {
  buildQuestBoard,
  useCompletions,
  useOneTimeCompletions,
  useQuests,
} from '../../lib/queries/quests';
import { systemMessage } from '../../lib/systemError';
import { QuestCard } from './QuestCard';

export function QuestsScreen() {
  const snapshot = useHunterSnapshot();
  const day = snapshot.data?.game_today;
  const timezone = snapshot.data?.hunter.timezone;

  const quests = useQuests();
  const food = useFood(day);
  const completions = useCompletions(day);
  const oneTimeCompletions = useOneTimeCompletions();
  const toast = useToast();

  const complete = useCompleteQuest(day);
  const undo = useUndoCompletion(day);

  const board = useMemo(() => {
    if (quests.data === undefined || completions.data === undefined || day === undefined) {
      return null;
    }
    return buildQuestBoard(
      quests.data,
      [...completions.data, ...(oneTimeCompletions.data ?? [])],
      day,
      timezone ?? 'UTC',
    );
  }, [quests.data, completions.data, oneTimeCompletions.data, day, timezone]);

  const isPending = snapshot.isPending || quests.isPending || completions.isPending;
  const error = snapshot.error ?? quests.error ?? completions.error;

  if (isPending) return <SystemLoading />;
  if (error !== null || board === null) {
    return (
      <SystemErrorPanel
        message={systemMessage(error, systemCopy.errors.load)}
        onRetry={() => {
          void quests.refetch();
          void completions.refetch();
        }}
      />
    );
  }

  const busy = complete.isPending || undo.isPending;
  const totals = sumFood(food.data);
  const targets = snapshot.data?.effective_targets_today;

  /**
   * 5.8: the calorie quest is judged only at day close, so the board reports
   * where the day stands without settling anything. Protein shows progress
   * towards the target that is in force today.
   */
  function liveStatusFor(
    tracking: string,
  ): { text: string; tone: 'steel' | 'system' | 'penalty' } | undefined {
    if (targets === undefined) return undefined;

    if (tracking === 'auto_kcal_range') {
      const status = kcalStatus(totals.kcal, targets.kcal_min, targets.kcal_max);
      const text = {
        empty: systemCopy.log.kcalEmpty,
        below: systemCopy.log.kcalBelow,
        in_range: systemCopy.log.kcalInRange,
        over: systemCopy.log.kcalOver,
      }[status];
      const tone = status === 'in_range' ? 'system' : status === 'over' ? 'penalty' : 'steel';
      return { text: `${String(totals.kcal)} kcal · ${text}`, tone };
    }

    if (tracking === 'auto_protein_min') {
      const met = totals.proteinG >= targets.protein_target_g;
      return {
        text: `${String(totals.proteinG)} / ${String(targets.protein_target_g)} g`,
        tone: met ? 'system' : 'steel',
      };
    }

    return undefined;
  }

  function handleComplete(questId: string, value: number | null) {
    complete.mutate(
      { questId, value },
      {
        onSuccess: (award) => {
          const stats = awardedStats(award)
            .map((entry) => `${entry.id} +${entry.amount}`)
            .join(' · ');
          const lines = [
            award.capped && award.xp === 0
              ? systemCopy.quests.capped
              : `+${award.xp} XP${stats === '' ? '' : ` · ${stats}`}`,
          ];
          if (award.capped && award.xp > 0) lines.push(systemCopy.quests.capped);
          toast.show({ title: systemCopy.quests.toastTitle, lines });
        },
        onError: (mutationError) => {
          toast.show({
            title: systemCopy.errors.generic,
            lines: [systemMessage(mutationError)],
            tone: 'penalty',
          });
        },
      },
    );
  }

  function handleUndo(completionId: string) {
    undo.mutate(completionId, {
      onSuccess: () => {
        toast.show({ title: systemCopy.quests.undoneTitle, lines: [] });
      },
      onError: (mutationError) => {
        toast.show({
          title: systemCopy.errors.generic,
          lines: [systemMessage(mutationError)],
          tone: 'penalty',
        });
      },
    });
  }

  return (
    <>
      <SystemWindow title={systemCopy.windows.dailyQuest} headerAside={day}>
        {board.daily.length === 0 ? (
          <EmptyState message={systemCopy.empty.quests} />
        ) : (
          <ul className="flex flex-col divide-y divide-system/10">
            {board.daily.map((view) => (
              <QuestCard
                key={view.quest.id}
                view={view}
                pending={busy}
                liveStatus={liveStatusFor(view.quest.tracking)}
                onComplete={(value) => {
                  handleComplete(view.quest.id, value);
                }}
                onUndo={() => {
                  if (view.completion !== null) handleUndo(view.completion.id);
                }}
              />
            ))}
          </ul>
        )}
      </SystemWindow>

      <SystemWindow title={systemCopy.windows.oneTimeQuest}>
        {board.oneTime.length === 0 ? (
          <EmptyState message={systemCopy.empty.oneTimeQuests} />
        ) : (
          <ul className="flex flex-col divide-y divide-system/10">
            {board.oneTime.map((view) => (
              <QuestCard
                key={view.quest.id}
                view={view}
                pending={busy}
                onComplete={(value) => {
                  handleComplete(view.quest.id, value);
                }}
                onUndo={() => {
                  if (view.completion !== null) handleUndo(view.completion.id);
                }}
              />
            ))}
          </ul>
        )}
      </SystemWindow>

      <SystemLink to="/quests/new" className="w-full">
        <PlusIcon className="size-4" />
        {systemCopy.actions.addQuest}
      </SystemLink>
    </>
  );
}
