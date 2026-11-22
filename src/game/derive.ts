import { STAT_IDS, type Rank, type StatId } from './config';
import { levelFromTotalXp, rankFromLevel } from './levels';
import { freePointsAvailable, freePointsEarned } from './points';
import { statFromStatXp } from './stats';

/** Exactly what hunter_snapshot() returns, in engine terms (brief 6.3). */
export interface HunterSnapshot {
  totalXp: number;
  statXp: Record<StatId, number>;
  freePointsFromEvents: number;
  allocatedPoints: Record<StatId, number>;
}

export interface DerivedStat {
  id: StatId;
  /** Grown from stat XP alone. */
  autoValue: number;
  allocated: number;
  /** What the hunter sees: autoValue + allocated. */
  value: number;
  xpIntoPoint: number;
  xpForNext: number;
  totalStatXp: number;
}

export interface HunterState {
  level: number;
  rank: Rank;
  totalXp: number;
  xpIntoLevel: number;
  xpForNext: number;
  isMaxLevel: boolean;
  stats: DerivedStat[];
  freePointsEarned: number;
  freePointsAvailable: number;
  allocatedTotal: number;
}

/**
 * ADR-1: every displayed number is derived here from the ledger totals. The
 * database stores no level, rank or stat value.
 */
export function deriveHunterState(snapshot: HunterSnapshot): HunterState {
  const progress = levelFromTotalXp(snapshot.totalXp);

  const stats: DerivedStat[] = STAT_IDS.map((id) => {
    const statProgress = statFromStatXp(snapshot.statXp[id]);
    const allocated = Math.max(0, Math.floor(snapshot.allocatedPoints[id]));
    return {
      id,
      autoValue: statProgress.autoValue,
      allocated,
      value: statProgress.autoValue + allocated,
      xpIntoPoint: statProgress.xpIntoPoint,
      xpForNext: statProgress.xpForNext,
      totalStatXp: statProgress.totalStatXp,
    };
  });

  const allocatedTotal = stats.reduce((sum, stat) => sum + stat.allocated, 0);
  const pointsInput = {
    level: progress.level,
    freePointsFromEvents: snapshot.freePointsFromEvents,
    allocatedPoints: allocatedTotal,
  };

  return {
    level: progress.level,
    rank: rankFromLevel(progress.level),
    totalXp: progress.totalXp,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNext: progress.xpForNext,
    isMaxLevel: progress.isMaxLevel,
    stats,
    freePointsEarned: freePointsEarned(pointsInput),
    freePointsAvailable: freePointsAvailable(pointsInput),
    allocatedTotal,
  };
}

/** True when a mutation pushed the hunter over a level threshold (brief 7.4). */
export function detectLevelUp(
  before: Pick<HunterState, 'level'>,
  after: Pick<HunterState, 'level'>,
): { leveledUp: boolean; fromLevel: number; toLevel: number; rankChanged: boolean } {
  const leveledUp = after.level > before.level;
  return {
    leveledUp,
    fromLevel: before.level,
    toLevel: after.level,
    rankChanged: leveledUp && rankFromLevel(after.level) !== rankFromLevel(before.level),
  };
}
