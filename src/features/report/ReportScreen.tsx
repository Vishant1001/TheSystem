import { useNavigate } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { SystemButton } from '../../components/SystemButton';
import { SystemLoading } from '../../components/SystemStates';
import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';
import { useAcknowledgeReport, usePendingReport, type ReportDay } from '../../lib/queries/report';
import { GateFailure, GateLayout } from '../gate/GateEscape';
import { useGateSignOut } from '../gate/useGateSignOut';

/** G8: a long backlog lists the recent days in full and sums the rest. */
const DETAILED_DAYS = 7;

/** Red only for a failed day (brief 7): rest and safe days are neutral. */
const statusStyle: Record<ReportDay['status'], { label: string; border: string; text: string }> = {
  cleared: {
    label: systemCopy.report.cleared,
    border: 'border-system/70',
    text: 'text-system-glow',
  },
  failed: {
    label: systemCopy.report.failed,
    border: 'border-penalty/60',
    text: 'text-penalty-text',
  },
  rest: { label: systemCopy.report.rest, border: 'border-steel/40', text: 'text-steel' },
  safe: { label: systemCopy.report.safe, border: 'border-steel/40', text: 'text-steel' },
};

function DayRow({ day }: { day: ReportDay }) {
  const style = statusStyle[day.status];
  return (
    <li className={`flex flex-col gap-1 border-l-2 py-2 pl-3 ${style.border}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-sm tracking-wide text-hunter" data-readout>
          {day.log_date}
        </span>
        <span
          className={`font-display text-xs font-semibold tracking-[0.18em] uppercase ${style.text}`}
        >
          {style.label}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 font-display text-[0.6875rem] text-steel" data-readout>
        <span>
          {systemCopy.report.coreQuests} {day.core_done}/{day.core_total}
        </span>
        <span>
          {day.xp_gained >= 0 ? '+' : ''}
          {day.xp_gained} XP
        </span>
        {day.free_points_gained > 0 && (
          <span className="text-system-glow">
            +{day.free_points_gained} {systemCopy.report.freePoint}
          </span>
        )}
        {day.streak > 0 && (
          <span>
            {systemCopy.report.streak} {day.streak}
          </span>
        )}
        {day.stone_earned && (
          <span className="text-system-glow">{systemCopy.report.stoneEarned}</span>
        )}
      </div>
    </li>
  );
}

export function ReportScreen() {
  const navigate = useNavigate();
  const { data, isPending, isError, error, refetch } = usePendingReport();
  const acknowledge = useAcknowledgeReport();
  const exit = useGateSignOut();

  // The report is a gate (brief 3.5): no navigation away while days are
  // unacknowledged, so a failure offers Retry and Sign out - never a dead end.
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

  const submit = () => {
    acknowledge.mutate(undefined, {
      onSuccess: () => {
        void navigate('/', { replace: true });
      },
    });
  };

  const days = data;
  const detailed = days.slice(0, DETAILED_DAYS);
  const rest = days.slice(DETAILED_DAYS);
  const restCleared = rest.filter((day) => day.status === 'cleared').length;
  const restPoints = rest.reduce((sum, day) => sum + day.free_points_gained, 0);
  const totalPoints = days.reduce((sum, day) => sum + day.free_points_gained, 0);

  if (days.length === 0) {
    // Nothing to acknowledge: not a gate, so the way back is offered.
    return (
      <SystemWindow title={systemCopy.windows.report}>
        <EmptyState
          message={systemCopy.empty.report}
          action={
            <SystemButton
              tone="ghost"
              onClick={() => {
                void navigate('/');
              }}
            >
              {systemCopy.actions.returnToStatus}
            </SystemButton>
          }
        />
      </SystemWindow>
    );
  }

  return (
    <GateLayout
      failure={acknowledge.error}
      onRetry={submit}
      onSignOut={exit.signOut}
      pending={exit.pending}
    >
      <SystemWindow
        title={systemCopy.windows.report}
        headerAside={`${String(days.length)} ${systemCopy.report.days}`}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-steel">{systemCopy.report.intro}</p>

          <ul className="flex flex-col divide-y divide-system/10">
            {detailed.map((day) => (
              <DayRow key={day.log_date} day={day} />
            ))}
          </ul>

          {rest.length > 0 && (
            <p className="font-display text-xs tracking-wider text-steel" data-readout>
              {rest.length} {systemCopy.report.earlierDays} · {restCleared}{' '}
              {systemCopy.report.cleared.toLowerCase()}
              {restPoints > 0 ? ` · +${String(restPoints)} ${systemCopy.report.freePoints}` : ''}
            </p>
          )}

          {totalPoints > 0 && (
            <p className="font-display text-sm text-system-glow" data-readout>
              +{totalPoints} {systemCopy.report.freePointsEarned}
            </p>
          )}

          <SystemButton className="w-full" disabled={acknowledge.isPending} onClick={submit}>
            {acknowledge.isPending ? systemCopy.report.working : systemCopy.actions.acknowledge}
          </SystemButton>
        </div>
      </SystemWindow>
    </GateLayout>
  );
}
