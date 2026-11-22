import { motion, useReducedMotion } from 'motion/react';

interface XpBarProps {
  value: number;
  /** 0 means "no next threshold", e.g. at max level: the bar reads full. */
  max: number;
  tone?: 'system' | 'steel';
  className?: string;
}

export function XpBar({ value, max, tone = 'system', className = '' }: XpBarProps) {
  const reduceMotion = useReducedMotion();
  const ratio = max <= 0 ? 1 : Math.min(1, Math.max(0, value / max));
  const percent = Math.round(ratio * 100);

  return (
    <div
      className={`h-2 w-full overflow-hidden border border-system/30 bg-abyss/80 ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max > 0 ? max : value}
    >
      <motion.div
        className={`h-full ${tone === 'system' ? 'bg-system shadow-system-glow' : 'bg-steel/70'}`}
        initial={reduceMotion ? false : { width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ duration: reduceMotion ? 0 : 0.5, ease: 'easeOut' }}
      />
    </div>
  );
}
