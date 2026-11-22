import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

export type SystemWindowVariant = 'system' | 'penalty' | 'monarch';

interface SystemWindowProps {
  /** Window title, rendered in the header strip. Omit for a bare panel. */
  title?: string;
  variant?: SystemWindowVariant;
  /** Right-hand side of the header strip (counts, status chips). */
  headerAside?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Mount animation. Always suppressed under prefers-reduced-motion. */
  animate?: boolean;
  children: ReactNode;
}

interface VariantStyle {
  frame: string;
  header: string;
  title: string;
  bracket: string;
}

/**
 * variant="penalty" is danger only (brief 7.1); variant="monarch" is reserved
 * for a later phase and unused in Phase 1.
 */
const variantStyles: Record<SystemWindowVariant, VariantStyle> = {
  system: {
    frame: 'border-system/60 bg-dungeon/90 shadow-system-glow',
    header: 'border-system/35 bg-system/10',
    title: 'text-system-glow',
    bracket: 'border-system-glow/80',
  },
  penalty: {
    frame: 'border-penalty/70 bg-penalty-bg/95 shadow-penalty-glow',
    header: 'border-penalty/40 bg-penalty/10',
    title: 'text-penalty-text',
    bracket: 'border-penalty-text/80',
  },
  monarch: {
    frame: 'border-monarch/60 bg-dungeon/90 shadow-monarch-glow',
    header: 'border-monarch/40 bg-monarch/10',
    title: 'text-monarch-text',
    bracket: 'border-monarch-text/80',
  },
};

export function SystemWindow({
  title,
  variant = 'system',
  headerAside,
  footer,
  className = '',
  bodyClassName = '',
  animate = true,
  children,
}: SystemWindowProps) {
  const reduceMotion = useReducedMotion();
  const styles = variantStyles[variant];
  const shouldAnimate = animate && !reduceMotion;

  return (
    <motion.section
      initial={shouldAnimate ? { opacity: 0, y: 10, scale: 0.985 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={`relative border ${styles.frame} ${className}`}
    >
      {/* Corner brackets: the System window signature. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute -top-px -left-px size-3 border-t-2 border-l-2 ${styles.bracket}`}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute -top-px -right-px size-3 border-t-2 border-r-2 ${styles.bracket}`}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute -bottom-px -left-px size-3 border-b-2 border-l-2 ${styles.bracket}`}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute -right-px -bottom-px size-3 border-r-2 border-b-2 ${styles.bracket}`}
      />

      {title !== undefined && (
        <header
          className={`flex items-center justify-between gap-3 border-b px-4 py-2 ${styles.header}`}
        >
          <h2
            className={`font-display text-sm font-semibold tracking-[0.2em] uppercase ${styles.title}`}
          >
            {title}
          </h2>
          {headerAside !== undefined && (
            <div className="font-display text-xs tracking-widest text-steel">{headerAside}</div>
          )}
        </header>
      )}

      <div className={`px-4 py-4 ${bodyClassName}`}>{children}</div>

      {footer !== undefined && (
        <footer className={`border-t px-4 py-3 ${styles.header}`}>{footer}</footer>
      )}
    </motion.section>
  );
}
