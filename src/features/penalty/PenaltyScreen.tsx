import { useState } from 'react';
import { Navigate } from 'react-router';
import { SystemButton } from '../../components/SystemButton';
import { SystemLoading } from '../../components/SystemStates';
import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';
import {
  useAcknowledgePenalty,
  useChoosePenalty,
  type PenaltyChoice,
} from '../../lib/mutations/penalty';
import { useHunterSnapshot } from '../../lib/queries/hunterSnapshot';
import {
  attentionGate,
  type HunterSnapshot,
  type Penalty,
  type PenaltyOptions,
} from '../../lib/schemas';
import { GateFailure, GateLayout } from '../gate/GateEscape';
import { useGateSignOut } from '../gate/useGateSignOut';
import { RedeemButton } from './RedeemButton';
import { formatDeadline, trialLine, weakenedLastDay, weekdayName } from './penaltyText';

/**
 * Brief 3.5: the penalty gate. After the System Report and before the
 * level-up modal, a failed day must be answered here - chosen in Standard,
 * acknowledged in Lenient, Hardcore or after an escalation. The route guards
 * keep every other screen out of reach until then.
 */
export function PenaltyScreen() {
  const { data, isPending, isError, error, refetch } = useHunterSnapshot();
  const exit = useGateSignOut();
  // The gate blocks navigation, so a failure here must never be a dead end:
  // every load or RPC failure offers Retry, and Sign out is always present.
  const [failure, setFailure] = useState<Failure | null>(null);

  if (isPending) return <SystemLoading />;
  if (isError) {
    return (
      <GateFailure
        error={error}
        pending={exit.pending}
        onSignOut={exit.signOut}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }
  if (data === null || data.penalty === null || attentionGate(data) !== 'penalty') {
    return <Navigate to="/" replace />;
  }

  const onFailure = (failed: unknown, retry: () => void) => {
    setFailure({ error: failed, retry });
  };

  return (
    <GateLayout
      failure={failure?.error ?? null}
      onRetry={() => {
        if (failure === null) return;
        setFailure(null);
        failure.retry();
      }}
      onSignOut={exit.signOut}
      pending={exit.pending}
    >
      {data.penalty.needs_choice && data.penalty_options !== null ? (
        <ChoosePenalty
          snapshot={data}
          penalty={data.penalty}
          options={data.penalty_options}
          onFailure={onFailure}
        />
      ) : (
        <AcknowledgePenalty snapshot={data} penalty={data.penalty} onFailure={onFailure} />
      )}
    </GateLayout>
  );
}

interface Failure {
  error: unknown;
  retry: () => void;
}

type OnFailure = (error: unknown, retry: () => void) => void;

function MissedQuests({ penalty }: { penalty: Penalty }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-display text-xs tracking-[0.18em] text-penalty-text uppercase">
        {systemCopy.penalty.failedDay} · {penalty.trigger_day}
      </p>
      <ul className="flex flex-col gap-0.5 text-sm text-steel">
        {penalty.missed_quests.map((quest, index) => (
          <li key={`${quest.quest_id ?? quest.title}-${String(index)}`}>
            {systemCopy.penalty.missed}: <span className="text-hunter">{quest.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChoosePenalty({
  snapshot,
  penalty,
  options,
  onFailure,
}: {
  snapshot: HunterSnapshot;
  penalty: Penalty;
  options: PenaltyOptions;
  onFailure: OnFailure;
}) {
  const [selected, setSelected] = useState<PenaltyChoice | null>(null);
  const choose = useChoosePenalty();

  const submit = (choice: PenaltyChoice) => {
    choose.mutate(choice, {
      onError: (mutationError) => {
        onFailure(mutationError, () => {
          submit(choice);
        });
      },
    });
  };

  const until = weekdayName(weakenedLastDay(snapshot.game_today, options.weakened.days));
  const choices: { id: PenaltyChoice; title: string; body: string; note?: string }[] = [
    {
      id: 'trial',
      title: systemCopy.penalty.trialTitle,
      body: trialLine(options.trial.category),
      note: systemCopy.penalty.trialFailure,
    },
    {
      id: 'debt',
      title: systemCopy.penalty.debtTitle,
      body: systemCopy.penalty.debtBody(options.debt.amount),
    },
    {
      id: 'weakened',
      title: systemCopy.penalty.weakenedTitle,
      body: systemCopy.penalty.weakenedBody(options.weakened.stat, until),
    },
  ];

  return (
    <SystemWindow
      variant="penalty"
      title={systemCopy.windows.penaltyZone}
      headerAside={penalty.trigger_day}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-hunter">{systemCopy.penalty.choosePrompt}</p>
        <MissedQuests penalty={penalty} />

        <div
          role="radiogroup"
          aria-label={systemCopy.penalty.pickOne}
          className="flex flex-col gap-2"
        >
          {choices.map((choice) => {
            const active = selected === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                role="radio"
                aria-label={`${choice.title}. ${choice.body}`}
                aria-checked={active}
                className={`flex flex-col gap-1 border px-3 py-3 text-left transition-colors ${
                  active
                    ? 'border-penalty-text bg-penalty/25'
                    : 'border-penalty/40 bg-penalty/5 hover:bg-penalty/15'
                }`}
                onClick={() => {
                  setSelected(choice.id);
                }}
              >
                <span className="font-display text-sm font-semibold tracking-[0.16em] text-penalty-text uppercase">
                  {choice.title}
                </span>
                <span className="text-sm text-hunter">{choice.body}</span>
                {choice.note !== undefined && (
                  <span className="text-xs text-steel">{choice.note}</span>
                )}
              </button>
            );
          })}
        </div>

        <SystemButton
          tone="penalty"
          className="w-full"
          disabled={selected === null || choose.isPending}
          onClick={() => {
            if (selected === null) return;
            submit(selected);
          }}
        >
          {choose.isPending
            ? systemCopy.penalty.choosing
            : selected === null
              ? systemCopy.penalty.pickOne
              : systemCopy.penalty.choose}
        </SystemButton>

        <RedeemButton snapshot={snapshot} onFailed={onFailure} />
      </div>
    </SystemWindow>
  );
}

function AcknowledgePenalty({
  snapshot,
  penalty,
  onFailure,
}: {
  snapshot: HunterSnapshot;
  penalty: Penalty;
  onFailure: OnFailure;
}) {
  const acknowledge = useAcknowledgePenalty();

  const submit = () => {
    acknowledge.mutate(undefined, {
      onError: (mutationError) => {
        onFailure(mutationError, submit);
      },
    });
  };

  let title: string = systemCopy.penalty.debtTitle;
  const lines: string[] = [];
  if (penalty.escalated && penalty.debt !== null) {
    title = systemCopy.penalty.escalatedTitle;
    lines.push(systemCopy.penalty.escalatedBody(penalty.debt.amount));
  } else if (penalty.choice === 'debt' && penalty.debt !== null) {
    title = systemCopy.penalty.lenientTitle;
    lines.push(systemCopy.penalty.lenientBody(penalty.debt.amount));
  } else if (penalty.choice === 'trial' && penalty.trial !== null) {
    title = systemCopy.penalty.hardcoreTitle;
    lines.push(systemCopy.penalty.hardcoreBody, trialLine(penalty.trial.category));
    lines.push(
      systemCopy.penalty.deadlineAt(
        formatDeadline(penalty.trial.deadline, snapshot.hunter.timezone),
      ),
    );
  }

  return (
    <SystemWindow
      variant="penalty"
      title={systemCopy.windows.penaltyZone}
      headerAside={penalty.trigger_day}
    >
      <div className="flex flex-col gap-4">
        <p className="font-display text-base font-semibold tracking-[0.16em] text-penalty-text uppercase">
          {title}
        </p>
        {lines.map((line) => (
          <p key={line} className="text-sm text-hunter">
            {line}
          </p>
        ))}
        <MissedQuests penalty={penalty} />

        <SystemButton
          tone="penalty"
          className="w-full"
          disabled={acknowledge.isPending}
          onClick={submit}
        >
          {acknowledge.isPending
            ? systemCopy.penalty.acknowledging
            : systemCopy.penalty.acknowledge}
        </SystemButton>

        <RedeemButton snapshot={snapshot} onFailed={onFailure} />
      </div>
    </SystemWindow>
  );
}
