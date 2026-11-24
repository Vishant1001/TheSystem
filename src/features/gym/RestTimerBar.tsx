import { useEffect } from 'react';
import { useReducedMotion } from 'motion/react';
import { systemCopy } from '../../copy/system';
import { restTimerState } from '../../game';
import { useNow } from '../../lib/useNow';
import { formatDuration } from './gymText';
import {
  adjustRunningTimer,
  markRestTimerNotified,
  stopRestTimer,
  useRestTimer,
  type RestTimer,
} from './restTimerStore';

/** How long a finished timer stays on screen before it clears itself. */
const LINGER_MS = 60_000;

const copy = systemCopy.gym;

/**
 * Brief 4.6: the rest timer, shown above the bottom nav on every screen so it
 * survives navigation. Vibrates once when it finishes (silently does nothing
 * where the Vibration API is missing); with reduced motion the bar jumps
 * instead of sliding.
 */
export function RestTimerBar() {
  const timer = useRestTimer();
  if (timer === null) return null;
  return <RunningTimer timer={timer} />;
}

function vibrate() {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {
    // Unsupported or blocked: the visual cue is enough.
  }
}

function RunningTimer({ timer }: { timer: RestTimer }) {
  const now = useNow(250).getTime();
  const reduceMotion = useReducedMotion();
  const { remainingMs, finished } = restTimerState(timer.startedAt, timer.durationS, now);
  const fraction = timer.durationS > 0 ? remainingMs / (timer.durationS * 1000) : 0;

  useEffect(() => {
    if (finished && !timer.notified) {
      vibrate();
      markRestTimerNotified();
    }
  }, [finished, timer.notified]);

  useEffect(() => {
    if (finished && now - (timer.startedAt + timer.durationS * 1000) > LINGER_MS) stopRestTimer();
  }, [finished, now, timer.startedAt, timer.durationS]);

  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-4 pb-2">
      <div
        className={`w-full max-w-md border bg-abyss/95 backdrop-blur ${
          finished ? 'border-system-glow shadow-system-glow' : 'border-system/40'
        }`}
        role="timer"
        aria-live={finished ? 'assertive' : 'off'}
        aria-label={copy.rest}
      >
        <div className="h-0.5 w-full bg-system/15">
          <div
            className={`h-0.5 bg-system-glow ${reduceMotion ? '' : 'transition-[width] duration-200 ease-linear'}`}
            style={{ width: `${String(Math.round(fraction * 1000) / 10)}%` }}
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="font-display text-xs tracking-[0.2em] text-steel uppercase">
            {finished ? copy.restDone : copy.rest}
          </span>
          <span
            className={`flex-1 font-display text-lg font-semibold ${finished ? 'text-system-glow text-glow' : 'text-hunter'}`}
            data-readout
          >
            {finished ? '0:00' : formatDuration(Math.ceil(remainingMs / 1000))}
          </span>
          <button
            type="button"
            className="min-h-10 min-w-11 border border-steel/40 px-2 font-display text-xs text-steel"
            onClick={() => {
              adjustRunningTimer(-1);
            }}
          >
            {copy.restMinus}
          </button>
          <button
            type="button"
            className="min-h-10 min-w-11 border border-steel/40 px-2 font-display text-xs text-steel"
            onClick={() => {
              adjustRunningTimer(1);
            }}
          >
            {copy.restPlus}
          </button>
          <button
            type="button"
            aria-label={copy.restStop}
            className="min-h-10 min-w-10 border border-steel/40 px-2 font-display text-sm text-steel"
            onClick={stopRestTimer}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
