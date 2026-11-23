import { describe, expect, it } from 'vitest';
import { awardFromOutcome, foodMutationSchema, workoutMutationSchema } from './logs';

/**
 * These fixtures are the exact shapes the RPCs return (supabase/README.md).
 *
 * The first version of this parser assumed every auto-evaluation returned an
 * award and that delete_workout reported a set_count. Neither is true: a
 * reversal returns a reversal summary, and delete_workout has no set count.
 * The payloads below pin both down.
 */
const completedAward = {
  completion_id: '00000000-0000-0000-0000-00000000000a',
  event_id: '00000000-0000-0000-0000-00000000000b',
  quest_id: '00000000-0000-0000-0000-00000000000c',
  quest_title: 'Train',
  occurred_on: '2026-11-22',
  category: 'fitness',
  xp: 35,
  full_xp: 35,
  capped: false,
  stat_xp: { STR: 9, AGI: 0, VIT: 8, INT: 0, SENSE: 0 },
};

const reversalSummary = {
  completion_id: '00000000-0000-0000-0000-00000000000a',
  quest_id: '00000000-0000-0000-0000-00000000000c',
  occurred_on: '2026-11-22',
  reversal_event_id: '00000000-0000-0000-0000-00000000000d',
  xp_removed: 35,
};

describe('log_workout payload', () => {
  it('accepts a completion', () => {
    const parsed = workoutMutationSchema.parse({
      workout_id: '00000000-0000-0000-0000-00000000000e',
      occurred_on: '2026-11-22',
      set_count: 2,
      auto_workout: { evaluated: true, action: 'completed', result: completedAward },
    });
    expect(awardFromOutcome(parsed.auto_workout)?.xp).toBe(35);
  });
});

describe('delete_workout payload', () => {
  it('parses without a set_count and with a reversal result', () => {
    const parsed = workoutMutationSchema.parse({
      workout_id: '00000000-0000-0000-0000-00000000000e',
      occurred_on: '2026-11-22',
      auto_workout: { evaluated: true, action: 'reversed', result: reversalSummary },
    });
    expect(parsed.set_count).toBeUndefined();
    expect(parsed.auto_workout.action).toBe('reversed');
    // A reversal is not an award, and must not be read as one.
    expect(awardFromOutcome(parsed.auto_workout)).toBeNull();
  });
});

describe('food payloads', () => {
  it('parses a completion, a reversal and an unchanged evaluation', () => {
    const completed = foodMutationSchema.parse({
      entry_id: '00000000-0000-0000-0000-00000000000f',
      occurred_on: '2026-11-22',
      auto_protein: {
        evaluated: true,
        action: 'completed',
        protein_g: 130,
        target_g: 120,
        result: { ...completedAward, quest_title: 'Hit protein', category: 'diet', xp: 20 },
      },
    });
    expect(awardFromOutcome(completed.auto_protein)?.xp).toBe(20);

    const reversed = foodMutationSchema.parse({
      entry_id: '00000000-0000-0000-0000-00000000000f',
      occurred_on: '2026-11-22',
      auto_protein: {
        evaluated: true,
        action: 'reversed',
        protein_g: 70,
        target_g: 120,
        result: reversalSummary,
      },
    });
    expect(awardFromOutcome(reversed.auto_protein)).toBeNull();

    const unchanged = foodMutationSchema.parse({
      entry_id: '00000000-0000-0000-0000-00000000000f',
      occurred_on: '2026-11-22',
      auto_protein: { evaluated: true, action: 'unchanged', protein_g: 70, target_g: 120 },
    });
    expect(awardFromOutcome(unchanged.auto_protein)).toBeNull();
  });

  it('parses an evaluation that did not run at all', () => {
    const parsed = foodMutationSchema.parse({
      entry_id: '00000000-0000-0000-0000-00000000000f',
      occurred_on: '2026-11-22',
      auto_protein: { evaluated: false },
    });
    expect(parsed.auto_protein.evaluated).toBe(false);
    expect(awardFromOutcome(parsed.auto_protein)).toBeNull();
  });
});
