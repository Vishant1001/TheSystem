import { motion, useReducedMotion } from 'motion/react';
import { systemCopy } from '../copy/system';
import { SystemButton } from './SystemButton';
import { SystemWindow } from './SystemWindow';

/** Shown while the System is fetching. Never a blank screen (brief 7.4). */
export function SystemLoading({ message = systemCopy.states.loading }: { message?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="h-px w-40 overflow-hidden bg-system/20">
        <motion.div
          className="h-px w-1/3 bg-system-glow"
          animate={reduceMotion ? { opacity: 0.6 } : { x: ['-120%', '360%'] }}
          transition={
            reduceMotion ? { duration: 0 } : { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      </div>
      <p className="font-display text-xs tracking-[0.2em] text-steel uppercase">{message}</p>
    </div>
  );
}

interface SystemErrorPanelProps {
  message: string;
  onRetry?: (() => void) | undefined;
}

/** Errors in the System's voice, never a raw exception (brief 7.4). */
export function SystemErrorPanel({ message, onRetry }: SystemErrorPanelProps) {
  return (
    <SystemWindow title={systemCopy.windows.unknownGate} variant="penalty">
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <p className="text-sm text-penalty-text">{message}</p>
        {onRetry !== undefined && (
          <SystemButton tone="ghost" onClick={onRetry}>
            {systemCopy.actions.retry}
          </SystemButton>
        )}
      </div>
    </SystemWindow>
  );
}

/** Full-height variant for guards, which render outside a shell. */
export function SystemScreenState({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-4">
      <div className="w-full">{children}</div>
    </div>
  );
}
