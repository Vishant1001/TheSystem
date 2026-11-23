import { useNavigate } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { SystemButton } from '../../components/SystemButton';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';
import { useAcknowledgeReport, usePendingReport, type ReportDay } from '../../lib/queries/report';
import { systemMessage } from '../../lib/systemError';

/** G8: a long backlog lists the recent days in full and sums the rest. */
const DETAILED_DAYS = 7;

function DayRow({ day }: { day: ReportDay }) {
  const cleared = day.status === 'cleared';
  return (
    <li
      className={`flex flex-col gap-1 border-l-2 py-2 pl-3 ${
        cleared ? 'border-system/70' : 'border-penalty/60'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-sm tracking-wide text-hunter" data-readout>
          {day.log_date}
        </span>
        <span
          className={`font-display text-xs font-semibold tracking-[0.18em] uppercase ${
            cleared ? 'text-system-glow' : 'text-penalty-text'
          }`}
        >
          {cleared ? systemCopy.report.cleared : systemCopy.report.failed}
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
      </div>
    </li>
  );
}

export function ReportScreen() {
  const navigate = useNavigate();
  const { data, isPending, isError, error, refetch } = usePendingReport();
  const acknowledge = useAcknowledgeReport();

  if (isPending) return <SystemLoading />;
  if (isError) {
    return (
      <SystemErrorPanel
        message={systemMessage(error, systemCopy.errors.load)}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const days = data;
  const detailed = days.slice(0, DETAILED_DAYS);
  const rest = days.slice(DETAILED_DAYS);
  const restCleared = rest.filter((day) => day.status === 'cleared').length;
  const restPoints = rest.reduce((sum, day) => sum + day.free_points_gained, 0);
  const totalPoints = days.reduce((sum, day) => sum + day.free_points_gained, 0);

  return (
    <SystemWindow
      title={systemCopy.windows.report}
      headerAside={days.length > 0 ? `${String(days.length)} ${systemCopy.report.days}` : undefined}
    >
      {days.length === 0 ? (
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
      ) : (
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

          <SystemButton
            className="w-full"
            disabled={acknowledge.isPending}
            onClick={() => {
              acknowledge.mutate(undefined, {
                onSuccess: () => {
                  void navigate('/', { replace: true });
                },
              });
            }}
          >
            {acknowledge.isPending ? systemCopy.report.working : systemCopy.actions.acknowledge}
          </SystemButton>
        </div>
      )}
    </SystemWindow>
  );
}
