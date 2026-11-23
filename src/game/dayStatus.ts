import { GAME_CONFIG, type GameConfig } from './config';
import { isoWeekday } from './schedule';

export const DAY_STATUSES = ['cleared', 'failed', 'rest', 'safe'] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];

/** How a closed day moves the clear streak (brief 3.6). */
export type StreakEffect = 'extend' | 'reset' | 'neutral';

/** Rest days are 0..maxRestDays distinct ISO weekdays (brief 3.7). */
export function isValidRestDays(
  restDays: readonly number[],
  config: GameConfig = GAME_CONFIG,
): boolean {
  return (
    restDays.length <= config.safeZones.maxRestDays &&
    new Set(restDays).size === restDays.length &&
    restDays.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)
  );
}

export function isRestDay(day: string, restDays: readonly number[]): boolean {
  return restDays.includes(isoWeekday(day));
}

/** One quest as the day tally sees it. */
export interface TallyQuest {
  isCore: boolean;
  onRestDays: boolean;
  /** Result of the board predicate (isScheduledOn) for that day. */
  scheduled: boolean;
  done: boolean;
}

/**
 * Brief 3.7: on a rest day only core quests flagged `on_rest_days` count.
 * Everything else stays on the board as "Rest day - optional".
 */
export function countsTowardCoreTally(quest: TallyQuest, restDay: boolean): boolean {
  return quest.isCore && quest.scheduled && (!restDay || quest.onRestDays);
}

export interface DayOutcomeInput {
  day: string;
  /** False for days before the Phase 2 rules epoch: Phase 1 rules apply. */
  phase2Rules: boolean;
  /** Rest weekdays in effect that day (versioned, C8). */
  restDays: readonly number[];
  /** The day falls inside a Sick/Travel period. */
  safe: boolean;
  quests: readonly TallyQuest[];
}

export interface DayOutcome {
  status: DayStatus;
  coreTotal: number;
  coreDone: number;
  freePoints: number;
  createsPenalty: boolean;
  streak: StreakEffect;
}

/**
 * The status of a closed day. Precedence: safe > rest > cleared/failed (3.9).
 *
 * - Safe day: no penalty, no free point, streak neutral.
 * - Rest day with at least one rest-day quest, all done: cleared + free point.
 *   Otherwise `rest`: no free point, never a penalty.
 * - Normal day: all core done -> cleared (G6: zero core is cleared but pays
 *   nothing and leaves the streak alone); anything missed -> failed.
 *
 * Days before the rules epoch keep Phase 1 rules exactly: no rest, safe,
 * penalty or streak.
 */
export function evaluateDay(input: DayOutcomeInput, config: GameConfig = GAME_CONFIG): DayOutcome {
  const restDay = input.phase2Rules && isRestDay(input.day, input.restDays);
  const counted = input.quests.filter((quest) => countsTowardCoreTally(quest, restDay));
  const coreTotal = counted.length;
  const coreDone = counted.filter((quest) => quest.done).length;
  const allDone = coreDone === coreTotal;
  const perClear = config.freePoints.perDailyClear;

  if (!input.phase2Rules) {
    return {
      status: allDone ? 'cleared' : 'failed',
      coreTotal,
      coreDone,
      freePoints: allDone && coreTotal > 0 ? perClear : 0,
      createsPenalty: false,
      streak: 'neutral',
    };
  }

  if (input.safe) {
    return {
      status: 'safe',
      coreTotal,
      coreDone,
      freePoints: 0,
      createsPenalty: false,
      streak: 'neutral',
    };
  }

  if (restDay) {
    if (coreTotal > 0 && allDone) {
      return {
        status: 'cleared',
        coreTotal,
        coreDone,
        freePoints: perClear,
        createsPenalty: false,
        streak: 'extend',
      };
    }
    return {
      status: 'rest',
      coreTotal,
      coreDone,
      freePoints: 0,
      createsPenalty: false,
      streak: 'neutral',
    };
  }

  if (!allDone) {
    return {
      status: 'failed',
      coreTotal,
      coreDone,
      freePoints: 0,
      createsPenalty: true,
      streak: 'reset',
    };
  }
  return {
    status: 'cleared',
    coreTotal,
    coreDone,
    freePoints: coreTotal > 0 ? perClear : 0,
    createsPenalty: false,
    streak: coreTotal > 0 ? 'extend' : 'neutral',
  };
}
