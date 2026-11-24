import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';
import { useHunterSnapshot } from '../../lib/queries/hunterSnapshot';
import { systemMessage } from '../../lib/systemError';
import { useAuth } from '../auth/authContext';
import { readDraft } from '../gym/draftStore';
import { FoodTab } from './FoodTab';
import { WorkoutTab } from './WorkoutTab';

type LogTab = 'food' | 'workout';

const tabs: { id: LogTab; label: string }[] = [
  { id: 'food', label: systemCopy.tabs.food },
  { id: 'workout', label: systemCopy.tabs.workout },
];

export function LogScreen() {
  // The logger returns here with ?tab=workout; a workout in progress also
  // opens on the Workout tab, so Resume is one tap away.
  const [params] = useSearchParams();
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<LogTab>(() =>
    params.get('tab') === 'workout' || (session !== null && readDraft(session.user.id) !== null)
      ? 'workout'
      : 'food',
  );
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
  if (data === null) return <SystemLoading />;

  return (
    <SystemWindow title={systemCopy.windows.log} headerAside={data.game_today}>
      <div role="tablist" aria-label={systemCopy.windows.log} className="mb-4 flex gap-2">
        {tabs.map(({ id, label }) => {
          const isActive = id === activeTab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`log-tab-${id}`}
              aria-selected={isActive}
              aria-controls={`log-panel-${id}`}
              onClick={() => {
                setActiveTab(id);
              }}
              className={`flex-1 border px-3 py-2 font-display text-xs font-semibold tracking-[0.16em] uppercase transition-colors ${
                isActive
                  ? 'border-system/70 bg-system/15 text-system-glow'
                  : 'border-steel/30 text-steel hover:border-steel/60 hover:text-hunter'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`log-panel-${activeTab}`}
        aria-labelledby={`log-tab-${activeTab}`}
        tabIndex={-1}
      >
        {activeTab === 'food' ? <FoodTab snapshot={data} /> : <WorkoutTab snapshot={data} />}
      </div>
    </SystemWindow>
  );
}
