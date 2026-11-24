import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';
import { formatCountdown, penaltyCountdown, shouldShowPenaltyWarning } from '../../game';
import type { HunterSnapshot } from '../../lib/schemas';
import { useNow } from '../../lib/useNow';
import { useWorkoutDraft } from '../gym/draftStore';
import { unfinishedWorkoutNote } from '../gym/gymText';

/**
 * Brief 3.2: from the warning hour until the rollover, while a core quest is
 * still open: "Daily quest incomplete. Penalty Zone in HH:MM:SS." Never on a
 * rest or safe day, and never before the Phase 2 rules apply.
 */
export function PenaltyWarning({
  snapshot,
  coreRemaining,
  trainOpen,
}: {
  snapshot: HunterSnapshot;
  coreRemaining: number;
  /** Train is still open today (2.7 review: unfinished-draft note). */
  trainOpen: boolean;
}) {
  const now = useNow(1000);
  const draftNote = unfinishedWorkoutNote({
    tracking: 'auto_workout',
    trainCompleted: !trainOpen,
    hasDraft: useWorkoutDraft() !== null,
    note: systemCopy.gym.unfinishedTrain,
  });
  const zones = snapshot.safe_zones;
  const countdown = penaltyCountdown(now, snapshot.hunter.timezone, zones.rules_today.penalty_mode);
  const dayKind = zones.is_safe_today ? 'safe' : zones.is_rest_day_today ? 'rest' : 'normal';
  const phase2 = snapshot.game_today >= zones.rules_from;

  if (!phase2 || !shouldShowPenaltyWarning({ countdown, dayKind, coreRemaining })) return null;

  return (
    <SystemWindow variant="penalty" title={systemCopy.windows.penaltyWarning}>
      <p role="alert" className="font-display text-sm tracking-wide text-penalty-text" data-readout>
        {systemCopy.penalty.warning(formatCountdown(countdown.msRemaining))}
      </p>
      {draftNote !== null && <p className="pt-2 text-sm text-penalty-text">{draftNote}</p>}
    </SystemWindow>
  );
}
