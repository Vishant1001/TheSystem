import { GAME_CONFIG } from './config';

const { perLevel } = GAME_CONFIG.freePoints;

export interface FreePointsInput {
  level: number;
  /** Sum of xp_events.free_points (daily clears today and in the past). */
  freePointsFromEvents: number;
  /** Sum of stat_allocations.points. */
  allocatedPoints: number;
}

/** Brief 5.4: freePointsEarned = 3 * (level - 1) + sum(xp_events.free_points). */
export function freePointsEarned(
  input: Pick<FreePointsInput, 'level' | 'freePointsFromEvents'>,
): number {
  const levelPoints = perLevel * Math.max(0, input.level - GAME_CONFIG.levels.startLevel);
  return levelPoints + Math.max(0, Math.floor(input.freePointsFromEvents));
}

/** Brief 5.4: available = earned - allocated. Never negative. */
export function freePointsAvailable(input: FreePointsInput): number {
  const earned = freePointsEarned(input);
  return Math.max(0, earned - Math.max(0, Math.floor(input.allocatedPoints)));
}

/**
 * ADR-5: allocation is validated client-side by the engine. Allocation is
 * permanent, so the caller must confirm before committing.
 */
export function canAllocate(points: number, available: number): boolean {
  return Number.isInteger(points) && points > 0 && points <= available;
}
