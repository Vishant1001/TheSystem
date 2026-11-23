import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { SystemButton } from '../../components/SystemButton';
import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';
import { GAME_CONFIG, deriveHunterState, rankFromLevel, type Rank } from '../../game';
import { useQueryClient } from '@tanstack/react-query';
import { hunterSnapshotKey, useHunterSnapshot } from '../../lib/queries/hunterSnapshot';
import { toEngineSnapshot, type HunterSnapshot } from '../../lib/schemas';

interface LevelUp {
  fromLevel: number;
  toLevel: number;
  freePoints: number;
  rankFrom: Rank;
  rankTo: Rank;
}

/**
 * Brief 7.3: one modal, showing the final level, however many thresholds were
 * crossed at once.
 *
 * It watches the derived level rather than diffing around each mutation, so a
 * level-up earned at day close raises it too (C6) without close_days needing
 * to know anything about the UI.
 */
export function LevelUpWatcher() {
  const queryClient = useQueryClient();
  const { data } = useHunterSnapshot();
  const lastSeenLevel = useRef<number | null>(null);
  const [levelUp, setLevelUp] = useState<LevelUp | null>(null);

  // Take the baseline from whatever the cache already holds at mount, not from
  // the first effect run. The day close starts the moment the shell mounts and
  // invalidates everything when it finishes, so an effect that happens to run
  // after that would otherwise adopt the post-close level as its baseline and
  // swallow the level-up the close just earned.
  if (lastSeenLevel.current === null) {
    const cached = queryClient.getQueryData<HunterSnapshot | null>(hunterSnapshotKey);
    if (cached !== undefined && cached !== null) {
      lastSeenLevel.current = deriveHunterState(toEngineSnapshot(cached)).level;
    }
  }

  useEffect(() => {
    if (data === null || data === undefined) return;

    const level = deriveHunterState(toEngineSnapshot(data)).level;
    const previous = lastSeenLevel.current;
    lastSeenLevel.current = level;

    // The first reading is the starting point, not an event.
    if (previous === null || level <= previous) return;

    setLevelUp({
      fromLevel: previous,
      toLevel: level,
      freePoints: GAME_CONFIG.freePoints.perLevel * (level - previous),
      rankFrom: rankFromLevel(previous),
      rankTo: rankFromLevel(level),
    });
  }, [data]);

  return (
    <LevelUpModal
      levelUp={levelUp}
      onDismiss={() => {
        setLevelUp(null);
      }}
    />
  );
}

function LevelUpModal({ levelUp, onDismiss }: { levelUp: LevelUp | null; onDismiss: () => void }) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {levelUp !== null && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-abyss/90 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.1 : 0.25 }}
          role="dialog"
          aria-modal="true"
          aria-label={systemCopy.levelUp.title}
        >
          <motion.div
            className="w-full max-w-md"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.32, ease: 'easeOut' }}
          >
            <SystemWindow animate={false}>
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <motion.h2
                  className="font-display text-3xl font-bold tracking-[0.3em] text-system-glow uppercase text-glow"
                  initial={reduceMotion ? false : { letterSpacing: '0.6em', opacity: 0 }}
                  animate={{ letterSpacing: '0.3em', opacity: 1 }}
                  transition={{ duration: reduceMotion ? 0 : 0.45, ease: 'easeOut' }}
                >
                  {systemCopy.levelUp.title}
                </motion.h2>

                <p className="font-display text-sm tracking-[0.2em] text-steel uppercase">
                  {systemCopy.levelUp.level}
                </p>
                <p className="flex items-baseline gap-3 font-display" data-readout>
                  <span className="text-2xl text-steel line-through">{levelUp.fromLevel}</span>
                  <span className="text-5xl font-bold text-system-glow text-glow">
                    {levelUp.toLevel}
                  </span>
                </p>

                <p className="font-display text-base text-hunter" data-readout>
                  +{levelUp.freePoints} {systemCopy.levelUp.freePoints}
                </p>

                {levelUp.rankTo !== levelUp.rankFrom && (
                  <p className="font-display text-sm tracking-[0.18em] text-monarch-text uppercase">
                    {systemCopy.levelUp.rankUp} {levelUp.rankTo}
                  </p>
                )}

                <SystemButton className="mt-2 w-full" onClick={onDismiss} autoFocus>
                  {systemCopy.levelUp.dismiss}
                </SystemButton>
              </div>
            </SystemWindow>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
