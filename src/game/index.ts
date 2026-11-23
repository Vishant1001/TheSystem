export {
  GAME_CONFIG,
  STAT_IDS,
  DIFFICULTIES,
  CATEGORIES,
  RANKS,
  PENALTY_MODES,
  EXERCISE_KINDS,
  AWARD_SOURCES,
  sqlConfigSlice,
  type PenaltyMode,
  type ExerciseKind,
  type AwardSource,
  type GameConfig,
  type StatId,
  type Difficulty,
  type Category,
  type Rank,
} from './config';

export {
  roundToNearest,
  xpToNext,
  totalXpForLevel,
  levelFromTotalXp,
  rankFromLevel,
  type LevelProgress,
} from './levels';

export { gameDateAt, gameToday } from './gameDate';

export {
  statXpToNext,
  totalStatXpForValue,
  statFromStatXp,
  displayedStatValue,
  emptyStatRecord,
  type StatProgress,
} from './stats';

export {
  questXp,
  dailyCap,
  baseStatXp,
  splitStatXp,
  computeQuestAward,
  type QuestAward,
  type QuestAwardInput,
} from './rewards';

export { freePointsEarned, freePointsAvailable, canAllocate, type FreePointsInput } from './points';

export {
  deriveHunterState,
  detectLevelUp,
  type HunterSnapshot,
  type HunterState,
  type DerivedStat,
} from './derive';

export {
  isoWeekday,
  wasActiveOn,
  isScheduledOn,
  isOverdue,
  type QuestType,
  type ScheduleInput,
} from './schedule';

export { addDays, daysBetween, wallTimeToInstant } from './dates';

export {
  penaltyCountdown,
  formatCountdown,
  shouldShowPenaltyWarning,
  type PenaltyCountdown,
  type DayKind,
} from './countdown';

export {
  DAY_STATUSES,
  isValidRestDays,
  isRestDay,
  countsTowardCoreTally,
  evaluateDay,
  type DayStatus,
  type StreakEffect,
  type TallyQuest,
  type DayOutcome,
  type DayOutcomeInput,
} from './dayStatus';

export {
  nextStreak,
  earnsStone,
  canSpendStone,
  stonesHeld,
  replayStreak,
  type StreakDay,
  type StreakStep,
} from './streak';

export {
  PENALTY_STATES,
  PENALTY_CHOICES,
  isOpenPenalty,
  canTransition,
  allowedChoices,
  initialPenalty,
  onFailedDay,
  onTrialExpired,
  trialCategory,
  weakenedStat,
  debtAmount,
  debtRepayment,
  debtRemaining,
  weakenedWindow,
  isWeakenedOn,
  trialDeadline,
  isTrialOpen,
  trialTemplate,
  type PenaltyState,
  type PenaltyChoice,
  type PenaltyCreation,
  type OpenPenalty,
  type FailedDayAction,
  type MissedQuest,
} from './penalty';

export {
  computeAward,
  splitByWeight,
  capRoom,
  type Award,
  type AwardInput,
  type StatWeight,
} from './award';

export {
  effectiveEnd,
  isSafeOn,
  safePeriodStart,
  checkSafePeriod,
  maxBookableDays,
  endEarlyOn,
  type SafeKind,
  type SafePeriod,
  type SafePeriodRefusal,
} from './safeZones';

export {
  kindForLibraryCategory,
  statForKind,
  toCentiKg,
  fromCentiKg,
  e1rmCentiKg,
  detectPrs,
  payablePrBonuses,
  workoutSetXp,
  defeatsBoss,
  bossReward,
  canHaveBoss,
  type SetType,
  type PrKind,
  type LoggedSet,
  type PrRecord,
  type PrDetection,
  type WorkoutSetInput,
  type WorkoutSetXp,
  type BossTarget,
} from './gym';

export {
  clampRestSeconds,
  adjustRestSeconds,
  restTimerState,
  type RestTimerState,
} from './restTimer';
