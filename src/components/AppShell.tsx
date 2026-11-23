import { Outlet, useLocation } from 'react-router';
import { systemCopy } from '../copy/system';
import { LevelUpWatcher } from '../features/status/LevelUpModal';
import { useDayClose } from '../features/report/useDayClose';
import { BottomNav } from './BottomNav';
import { ErrorBoundary } from './ErrorBoundary';
import { SystemLoading } from './SystemStates';

/** Mobile-first centered column with the System header and bottom nav. */
export function AppShell() {
  // ADR-7: every app load settles the days that passed while you were away,
  // before anything else is shown.
  const dayClose = useDayClose(true);
  const { pathname } = useLocation();
  const settling = dayClose === 'idle' || dayClose === 'closing';

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-safe pb-28">
      <header className="mb-4 flex items-baseline justify-between">
        <span className="font-display text-base font-bold tracking-[0.34em] text-system-glow uppercase text-glow">
          {systemCopy.app.name}
        </span>
      </header>
      <main className="flex flex-1 flex-col gap-4">
        {settling ? (
          <SystemLoading message={systemCopy.report.closing} />
        ) : (
          // One broken screen must not take the navigation down with it; moving
          // to another route clears the boundary.
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        )}
      </main>
      <LevelUpWatcher />
      <BottomNav />
    </div>
  );
}
