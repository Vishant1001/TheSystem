import { SystemLink } from '../../components/SystemLink';
import { SystemWindow } from '../../components/SystemWindow';
import { XpBar } from '../../components/XpBar';
import { systemCopy } from '../../copy/system';
import { formatCountdown } from '../../game';
import type { HunterSnapshot } from '../../lib/schemas';
import { useNow } from '../../lib/useNow';
import { RedeemButton } from './RedeemButton';
import { weekdayName } from './penaltyText';

/**
 * Brief 7: the open penalty on Status - its type and what is left (trial
 * deadline, debt remaining, Weakened until), with the stone to spend on it.
 */
export function ActivePenalty({ snapshot }: { snapshot: HunterSnapshot }) {
  const now = useNow(1000);
  const penalty = snapshot.penalty;
  if (penalty === null) return null;

  let headline: string = systemCopy.penalty.pendingLeft;
  let hint: string | null = null;
  let bar: { value: number; max: number } | null = null;
  let toQuests = false;

  if (penalty.state === 'trial_active' && penalty.trial !== null) {
    const left = new Date(penalty.trial.deadline).getTime() - now.getTime();
    headline = systemCopy.penalty.trialLeft(formatCountdown(left));
    hint = systemCopy.penalty.trialHint;
    toQuests = true;
  } else if (penalty.state === 'debt_active' && penalty.debt !== null) {
    headline = systemCopy.penalty.debtLeft(penalty.debt.remaining, penalty.debt.amount);
    hint = systemCopy.penalty.debtHint;
    bar = { value: penalty.debt.amount - penalty.debt.remaining, max: penalty.debt.amount };
  } else if (penalty.state === 'weakened_active' && penalty.weakened !== null) {
    headline = systemCopy.penalty.weakenedLeft(
      penalty.weakened.stat,
      weekdayName(penalty.weakened.until),
    );
    hint = systemCopy.penalty.weakenedHint;
  }

  return (
    <SystemWindow
      variant="penalty"
      title={systemCopy.windows.activePenalty}
      headerAside={penalty.trigger_day}
    >
      <div className="flex flex-col gap-3">
        <p className="font-display text-sm tracking-wide text-penalty-text" data-readout>
          {headline}
        </p>
        {bar !== null && <XpBar value={bar.value} max={bar.max} tone="steel" />}
        {hint !== null && <p className="text-xs text-steel">{hint}</p>}
        {toQuests && (
          <SystemLink to="/quests" tone="penalty" className="w-full">
            {systemCopy.nav.quests}
          </SystemLink>
        )}
        <RedeemButton snapshot={snapshot} />
      </div>
    </SystemWindow>
  );
}
