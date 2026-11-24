import { systemCopy } from '../../copy/system';
import { GAME_CONFIG, addDays, isoWeekday, type Category } from '../../game';

/** Weekday name of a game date, for "Weakened until Wednesday". */
export function weekdayName(day: string): string {
  return systemCopy.safeZones.weekdayNames[isoWeekday(day) - 1] ?? day;
}

/** The last day a Weakened penalty chosen today would cover. */
export function weakenedLastDay(today: string, days: number): string {
  return addDays(today, days - 1);
}

/** "15 min" / "log at least 3 meals" for a trial template. */
export function trialTargetText(goalType: 'duration' | 'count', target: number): string {
  return goalType === 'duration'
    ? systemCopy.penalty.durationTarget(target)
    : systemCopy.penalty.countTarget(target);
}

/** The full trial line for a category, straight from the config template. */
export function trialLine(category: Category): string {
  const template = GAME_CONFIG.penalty.trial.templates[category];
  return systemCopy.penalty.trialBody(
    template.title,
    trialTargetText(template.goalType, template.target),
    GAME_CONFIG.penalty.trial.deadlineHours,
    GAME_CONFIG.penalty.trial.xp,
  );
}

/** Local wall-clock time of an instant, for the trial deadline. */
export function formatDeadline(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
