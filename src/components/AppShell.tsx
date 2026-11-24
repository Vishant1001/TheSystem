import { Outlet, useLocation } from 'react-router';
import { systemCopy } from '../copy/system';
import { RestTimerBar } from '../features/gym/RestTimerBar';
import { useRestTimer } from '../features/gym/restTimerStore';
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
  // The gates offer no navigation besides Retry and Sign out (brief 3.5).
  const onGate = pathname === '/report' || pathname === '/penalty';
  // Brief 4.6: the rest timer survives navigation, so it lives in the shell.
  const timerShowing = useRestTimer() !== null && !onGate;

  return (
    <div
      className={`mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-safe ${timerShowing ? 'pb-44' : 'pb-28'}`}
    >
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
      {timerShowing && <RestTimerBar />}
      {!onGate && <BottomNav />}
    </div>
  );
}
