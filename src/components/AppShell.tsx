import { Outlet } from 'react-router';
import { systemCopy } from '../copy/system';
import { BottomNav } from './BottomNav';

/** Mobile-first centered column with the System header and bottom nav. */
export function AppShell() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-safe pb-28">
      <header className="mb-4 flex items-baseline justify-between">
        <span className="font-display text-base font-bold tracking-[0.34em] text-system-glow uppercase text-glow">
          {systemCopy.app.name}
        </span>
      </header>
      <main className="flex flex-1 flex-col gap-4">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
