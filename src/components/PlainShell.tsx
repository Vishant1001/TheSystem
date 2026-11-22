import { Outlet } from 'react-router';
import { systemCopy } from '../copy/system';

/** Shell for pre-authentication screens: no bottom nav, vertically centered. */
export function PlainShell() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 pt-safe pb-safe">
      <header className="text-center">
        <span className="font-display text-xl font-bold tracking-[0.34em] text-system-glow uppercase text-glow">
          {systemCopy.app.name}
        </span>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
