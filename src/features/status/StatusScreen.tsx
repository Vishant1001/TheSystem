import { StatRow } from '../../components/StatRow';
import { SystemLink } from '../../components/SystemLink';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { SystemWindow } from '../../components/SystemWindow';
import { XpBar } from '../../components/XpBar';
import { systemCopy } from '../../copy/system';
import { CATEGORIES, deriveHunterState, type Category } from '../../game';
import { useHunterSnapshot } from '../../lib/queries/hunterSnapshot';
import { toEngineSnapshot } from '../../lib/schemas';
import { systemMessage } from '../../lib/systemError';

const categoryLabels: Record<Category, string> = {
  fitness: 'Fitness',
  diet: 'Diet',
  life: 'Life',
};

export function StatusScreen() {
  const { data, isPending, isError, error, refetch } = useHunterSnapshot();

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
  // The guard redirects to onboarding before this can render.
  if (data === null) return <SystemLoading />;

  const state = deriveHunterState(toEngineSnapshot(data));

  return (
    <>
      <SystemWindow
        title={systemCopy.windows.status}
        headerAside={`${systemCopy.status.rank} ${state.rank}`}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="truncate font-display text-xl font-bold tracking-wide text-hunter">
              {data.hunter.hunter_name}
            </h2>
            <span className="font-display text-sm tracking-[0.2em] text-steel uppercase">
              {systemCopy.status.level}{' '}
              <span className="text-2xl font-bold text-system-glow text-glow" data-readout>
                {state.level}
              </span>
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <XpBar value={state.xpIntoLevel} max={state.xpForNext} />
            <div className="flex justify-between font-display text-[0.6875rem] tracking-wider text-steel">
              <span data-readout>
                {state.xpIntoLevel} / {state.isMaxLevel ? '-' : state.xpForNext}{' '}
                {systemCopy.status.xp}
              </span>
              <span data-readout>
                {state.isMaxLevel
                  ? systemCopy.status.maxLevel
                  : `${state.xpForNext - state.xpIntoLevel} ${systemCopy.status.toNext}`}
              </span>
            </div>
          </div>
        </div>
      </SystemWindow>

      <SystemWindow
        title={systemCopy.status.stats}
        headerAside={
          state.freePointsAvailable > 0
            ? `${systemCopy.status.freePoints}: ${state.freePointsAvailable}`
            : undefined
        }
      >
        <ul className="flex flex-col divide-y divide-system/10">
          {state.stats.map((stat) => (
            <StatRow key={stat.id} stat={stat} />
          ))}
        </ul>
        {state.freePointsAvailable === 0 && (
          <p className="pt-3 text-xs text-steel/80">{systemCopy.status.noFreePoints}</p>
        )}
      </SystemWindow>

      <SystemWindow title={systemCopy.status.todayXp} headerAside={data.game_today}>
        <ul className="flex flex-col gap-3">
          {CATEGORIES.map((category) => {
            const earned = data.today_xp_by_category[category];
            const cap = data.daily_caps[category];
            return (
              <li key={category} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs tracking-wide text-steel">
                    {categoryLabels[category]}
                  </span>
                  <span className="font-display text-xs text-hunter" data-readout>
                    {earned} / {cap} {systemCopy.status.cap}
                  </span>
                </div>
                <XpBar value={earned} max={cap} />
              </li>
            );
          })}
        </ul>
      </SystemWindow>

      <div className="flex justify-center pb-2">
        <SystemLink to="/settings" tone="ghost">
          {systemCopy.settings.open}
        </SystemLink>
      </div>
    </>
  );
}
