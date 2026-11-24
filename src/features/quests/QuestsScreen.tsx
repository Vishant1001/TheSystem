import { EmptyState } from '../../components/EmptyState';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { SystemLink } from '../../components/SystemLink';
import { SystemWindow } from '../../components/SystemWindow';
import { PlusIcon } from '../../components/icons';
import { useToast } from '../../components/toastContext';
import { systemCopy } from '../../copy/system';
import { formatCountdown } from '../../game';
import {
  awardedStats,
  modifierLines,
  useCompleteQuest,
  useUndoCompletion,
} from '../../lib/mutations/quests';
import { useHunterSnapshot } from '../../lib/queries/hunterSnapshot';
import { kcalStatus, sumFood, useFood } from '../../lib/queries/logs';
import type { QuestView } from '../../lib/queries/quests';
import { systemMessage } from '../../lib/systemError';
import { useNow } from '../../lib/useNow';
import { PenaltyWarning } from '../penalty/PenaltyWarning';
import { QuestCard } from './QuestCard';
import { useTodayBoard } from './useTodayBoard';

function TrialDeadline({ deadline }: { deadline: string }) {
  const now = useNow(1000);
  return (
    <span data-readout>
      {systemCopy.quests.trialDeadline(
        formatCountdown(new Date(deadline).getTime() - now.getTime()),
      )}
    </span>
  );
}

export function QuestsScreen() {
  const snapshot = useHunterSnapshot();
  const data = snapshot.data;
  const day = data?.game_today;

  const today = useTodayBoard(data);
  const food = useFood(day);
  const toast = useToast();

  const complete = useCompleteQuest(day);
  const undo = useUndoCompletion(day);

  if (snapshot.isPending || today.isPending) return <SystemLoading />;
  const error = snapshot.error ?? today.error;
  if (error !== null || today.board === null || data === null || data === undefined) {
    return (
      <SystemErrorPanel
        message={systemMessage(error, systemCopy.errors.load)}
        onRetry={() => {
          today.refetch();
        }}
      />
    );
  }

  const board = today.board;
  const zones = data.safe_zones;
  const busy = complete.isPending || undo.isPending;
  const totals = sumFood(food.data);
  const targets = data.effective_targets_today;

  // Only the trial of the open penalty belongs on the board (brief 3.4).
  const penalty = data.penalty;
  const openTrial = penalty?.state === 'trial_active' ? (penalty.trial ?? null) : null;
  const activeTrial =
    openTrial === null
      ? undefined
      : board.trial.find((view) => view.quest.id === openTrial.quest_id);

  /**
   * 5.8: the calorie quest is judged only at day close, so the board reports
   * where the day stands without settling anything. Protein shows progress
   * towards the target that is in force today.
   */
  function liveStatusFor(
    tracking: string,
  ): { text: string; tone: 'steel' | 'system' | 'penalty' } | undefined {
    // A failed food read must not render as "0 kcal": show nothing instead.
    if (food.isError) return undefined;

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

  function handleComplete(view: QuestView, value: number | null) {
    complete.mutate(
      { questId: view.quest.id, value },
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
          lines.push(...modifierLines(award));
          const title =
            view.quest.type === 'trial'
              ? systemCopy.penalty.trialToast
              : systemCopy.quests.toastTitle;
          toast.show({ title, lines });
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

  const restDay = zones.is_rest_day_today;
  const card = (view: QuestView, live?: ReturnType<typeof liveStatusFor>) => (
    <QuestCard
      key={view.quest.id}
      view={view}
      pending={busy}
      liveStatus={live}
      restOptional={restDay && view.quest.is_core && !view.quest.on_rest_days}
      onComplete={(value) => {
        handleComplete(view, value);
      }}
      onUndo={() => {
        if (view.completion !== null) handleUndo(view.completion.id);
      }}
    />
  );

  return (
    <>
      <PenaltyWarning snapshot={data} coreRemaining={today.coreRemaining} />

      {activeTrial !== undefined && openTrial !== null && (
        <SystemWindow
          variant="penalty"
          title={systemCopy.windows.survivalTrial}
          headerAside={<TrialDeadline deadline={openTrial.deadline} />}
        >
          <ul className="flex flex-col">{card(activeTrial)}</ul>
        </SystemWindow>
      )}

      <SystemWindow title={systemCopy.windows.dailyQuest} headerAside={day}>
        {(zones.is_safe_today || restDay) && (
          <p className="mb-2 border-l-2 border-system/50 pl-3 text-xs text-steel">
            {zones.is_safe_today
              ? systemCopy.quests.safeDayBanner
              : systemCopy.quests.restDayBanner}
          </p>
        )}
        {board.daily.length === 0 ? (
          <EmptyState message={systemCopy.empty.quests} />
        ) : (
          <ul className="flex flex-col divide-y divide-system/10">
            {board.daily.map((view) => card(view, liveStatusFor(view.quest.tracking)))}
          </ul>
        )}
      </SystemWindow>

      <SystemWindow title={systemCopy.windows.oneTimeQuest}>
        {board.oneTime.length === 0 ? (
          <EmptyState message={systemCopy.empty.oneTimeQuests} />
        ) : (
          <ul className="flex flex-col divide-y divide-system/10">
            {board.oneTime.map((view) => card(view))}
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
