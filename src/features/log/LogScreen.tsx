import { useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';

type LogTab = 'food' | 'workout';

const tabs: { id: LogTab; label: string }[] = [
  { id: 'food', label: systemCopy.tabs.food },
  { id: 'workout', label: systemCopy.tabs.workout },
];

export function LogScreen() {
  const [activeTab, setActiveTab] = useState<LogTab>('food');

  return (
    <SystemWindow title={systemCopy.windows.log}>
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
              onClick={() => setActiveTab(id)}
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
        <EmptyState
          message={activeTab === 'food' ? systemCopy.empty.food : systemCopy.empty.workouts}
        />
      </div>
    </SystemWindow>
  );
}
