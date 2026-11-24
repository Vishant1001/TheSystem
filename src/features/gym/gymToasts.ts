import type { ToastContent } from '../../components/toastContext';
import { systemCopy } from '../../copy/system';
import { STAT_IDS } from '../../game';
import {
  awardFromOutcome,
  type AutoOutcome,
  type GymAward,
  type WorkoutMutationResult,
} from '../../lib/mutations/logs';
import { awardedStats, modifierLines } from '../../lib/mutations/quests';
import { formatCentiKg } from './gymText';

const copy = systemCopy.gym;

/** The toast for the Train quest, exactly as Phase 1 raised it. */
export function autoQuestToast(outcome: AutoOutcome): ToastContent | null {
  const award = awardFromOutcome(outcome);
  if (award !== null) {
    const stats = awardedStats(award)
      .map((entry) => `${entry.id} +${String(entry.amount)}`)
      .join(' · ');
    return {
      title: systemCopy.quests.toastTitle,
      lines: [
        award.capped && award.xp === 0
          ? systemCopy.quests.capped
          : `+${String(award.xp)} XP${stats === '' ? '' : ` · ${stats}`}`,
        ...modifierLines(award),
      ],
    };
  }
  if (outcome.action === 'reversed') {
    return { title: systemCopy.quests.undoneTitle, lines: [systemCopy.log.autoReversed] };
  }
  return null;
}

function statLine(award: GymAward): string {
  return STAT_IDS.filter((id) => award.stat_xp[id] !== 0)
    .map((id) => `${id} +${String(award.stat_xp[id])}`)
    .join(' · ');
}

function modifiers(award: GymAward): string[] {
  const lines: string[] = [];
  if (award.debt_repayment > 0) lines.push(systemCopy.quests.repaid(award.debt_repayment));
  if (award.weakened) lines.push(systemCopy.quests.weakenedZeroed);
  return lines;
}

/**
 * The toasts for a logged workout (brief 4.6): set XP, then one per
 * record-breaking set ("[NEW RECORD] Squat e1RM 92.5 kg · +25 XP"), then one
 * per boss ("[BOSS DEFEATED] Igris · +100 XP · +1 free point"). Baselines are
 * silent: a first session is not a record.
 */
export function workoutToasts(result: WorkoutMutationResult): ToastContent[] {
  const toasts: ToastContent[] = [];

  const award = result.workout_award ?? null;
  if (award !== null) {
    const stats = statLine(award);
    toasts.push({
      title: copy.workoutToastTitle,
      lines: [
        award.capped && award.xp === 0
          ? systemCopy.quests.capped
          : `+${String(award.xp)} XP${stats === '' ? '' : ` · ${stats}`}`,
        ...modifiers(award),
      ],
    });
  } else if (result.counted_sets === 0 && (result.set_count ?? 0) > 0) {
    toasts.push({ title: copy.workoutToastTitle, lines: [copy.noSetXp] });
  }

  // Records, grouped by the set that broke them, in reply order.
  const bySet = new Map<string, WorkoutMutationResult['records']>();
  for (const record of result.records) {
    if (record.baseline) continue;
    bySet.set(record.set_id, [...(bySet.get(record.set_id) ?? []), record]);
  }
  for (const [setId, records] of bySet) {
    const first = records[0];
    if (first === undefined) continue;
    const parts = records
      .map(
        (record) =>
          `${record.pr_kind === 'e1rm' ? copy.e1rm : copy.maxWeight} ${formatCentiKg(record.value_centi)} kg`,
      )
      .join(' · ');
    const bonus = result.pr_bonuses.find((candidate) => candidate.set_id === setId);
    toasts.push({
      title: copy.recordTitle,
      lines:
        bonus === undefined
          ? [`${first.exercise_name} ${parts}`, copy.recordUnpaid]
          : [`${first.exercise_name} ${parts} · +${String(bonus.xp)} XP`, ...modifiers(bonus)],
    });
  }

  for (const boss of result.bosses_defeated) {
    toasts.push({
      title: copy.bossTitle,
      lines: [
        `${boss.boss_name} · +${String(boss.xp)} XP · ${copy.freePoints(boss.free_points)}`,
        ...modifiers(boss),
      ],
    });
  }
  return toasts;
}
