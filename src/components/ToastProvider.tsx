import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { SystemWindow } from './SystemWindow';
import { useRestTimer } from '../features/gym/restTimerStore';
import { ToastContext, type ToastContent } from './toastContext';

interface ActiveToast extends ToastContent {
  id: number;
}

const VISIBLE_MS = 4200;
/** While more toasts wait, each one stays up for less time. */
const QUEUED_MS = 2800;

/**
 * The System's feedback moments (brief 7.3): a short window that slides in
 * above the bottom nav after a quest completes, then withdraws itself.
 * Toasts queue: a workout can raise several (set XP, records, a boss).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ActiveToast[]>([]);
  const toast = queue[0] ?? null;
  const waiting = queue.length > 1;
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();
  // Toasts rise above the rest timer bar while it is showing.
  const timerShowing = useRestTimer() !== null;

  const show = useCallback((content: ToastContent) => {
    nextId.current += 1;
    const id = nextId.current;
    setQueue((current) => [...current, { ...content, id }]);
  }, []);

  useEffect(() => {
    if (toast === null) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        setQueue((current) => current.slice(1));
      },
      waiting ? QUEUED_MS : VISIBLE_MS,
    );
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [toast, waiting]);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className={`pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4 ${timerShowing ? 'bottom-36' : 'bottom-20'}`}
      >
        <div className="w-full max-w-md">
          <AnimatePresence>
            {toast !== null && (
              <motion.div
                key={toast.id}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                transition={{ duration: reduceMotion ? 0.12 : 0.24, ease: 'easeOut' }}
                className="pointer-events-auto"
                role="status"
                aria-live="polite"
              >
                <SystemWindow variant={toast.tone ?? 'system'} animate={false} bodyClassName="py-3">
                  <p className="font-display text-sm font-semibold tracking-[0.12em] text-system-glow uppercase">
                    {toast.title}
                  </p>
                  {toast.lines.map((line) => (
                    <p key={line} className="font-display text-sm text-hunter" data-readout>
                      {line}
                    </p>
                  ))}
                </SystemWindow>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </ToastContext.Provider>
  );
}
