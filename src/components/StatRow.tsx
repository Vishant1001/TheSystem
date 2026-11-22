import type { DerivedStat } from '../game';
import { XpBar } from './XpBar';

interface StatRowProps {
  stat: DerivedStat;
  /** Slot for the allocate control, which arrives in step 1.7. */
  action?: React.ReactNode;
}

export function StatRow({ stat, action }: StatRowProps) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span className="w-16 font-display text-xs font-semibold tracking-[0.18em] text-steel uppercase">
        {stat.id}
      </span>

      <span className="w-10 text-right font-display text-lg font-bold text-hunter" data-readout>
        {stat.value}
      </span>

      {stat.allocated > 0 && (
        <span className="font-display text-xs text-system-glow" data-readout>
          +{stat.allocated}
        </span>
      )}

      <div className="flex flex-1 flex-col gap-1">
        <XpBar value={stat.xpIntoPoint} max={stat.xpForNext} tone="steel" />
        <span className="font-display text-[0.625rem] tracking-wider text-steel/80" data-readout>
          {stat.xpIntoPoint} / {stat.xpForNext}
        </span>
      </div>

      {action}
    </li>
  );
}
