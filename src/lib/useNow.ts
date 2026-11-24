import { useEffect, useState } from 'react';

/**
 * The current instant, re-rendered every `intervalMs`. The engine never reads
 * the clock (ADR-2); components that need a live countdown read it here and
 * pass it in.
 */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
