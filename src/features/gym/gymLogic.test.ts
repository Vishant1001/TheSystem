import { describe, expect, it } from 'vitest';
import { systemCopy } from '../../copy/system';
import { GAME_CONFIG } from '../../game';
import { workoutMutationSchema } from '../../lib/mutations/logs';
import { resolveSupabaseUrl } from '../../lib/supabaseUrl';
import { facetOptions, searchExercises, type SearchableExercise } from './exerciseSearch';
import { workoutToasts } from './gymToasts';
import {
  formatDistance,
  formatDuration,
  formatKg,
  sessionSummary,
  setLabel,
  unfinishedWorkoutNote,
} from './gymText';
import { bestE1rmPerSession, sparklinePath, sparklinePoints } from './sparkline';
import {
  addExercise,
  createDraft,
  DRAFT_STORAGE_KEY,
  loadDraft,
  logSet,
  parseInputs,
  saveDraft,
  toPayload,
  updateInputs,
  type DraftSet,
} from './workoutDraft';

const working = (reps: number | null, weight_kg: number | null) => ({
  set_type: 'working',
  reps,
  weight_kg,
  duration_s: null,
  distance_m: null,
});

describe('gym text (brief 4.6)', () => {
  it('formats weights, durations and distances', () => {
    expect(formatKg(60)).toBe('60');
    expect(formatKg(92.5)).toBe('92.5');
    expect(formatKg(77.25)).toBe('77.25');
    expect(formatDuration(95)).toBe('1:35');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDistance(3000)).toBe('3 km');
    expect(formatDistance(2500)).toBe('2.5 km');
    expect(formatDistance(400)).toBe('400 m');
  });

  it('summarises last time the way the brief shows it', () => {
    expect(sessionSummary([working(8, 60), working(8, 60), working(8, 60)])).toBe('3 × 8 @ 60 kg');
  });

  it('leaves warmups out and groups only identical neighbours', () => {
    expect(
      sessionSummary([
        { ...working(10, 40), set_type: 'warmup' },
        working(8, 60),
        working(8, 60),
        working(6, 65),
      ]),
    ).toBe('2 × 8 @ 60 kg, 1 × 6 @ 65 kg');
  });

  it('reads bodyweight and cardio sets', () => {
    expect(sessionSummary([working(12, null), working(12, null)])).toBe('2 × 12');
    expect(
      setLabel({
        set_type: 'working',
        reps: null,
        weight_kg: null,
        duration_s: 1200,
        distance_m: 3000,
      }),
    ).toBe('20:00 · 3 km');
    expect(setLabel(working(8, 60))).toBe('8 × 60 kg');
    expect(setLabel(working(15, 0))).toBe('15 reps');
  });
});

const ex = (
  id: string,
  name: string,
  overrides: Partial<SearchableExercise> = {},
): SearchableExercise => ({
  id,
  user_id: null,
  name,
  kind: 'strength',
  equipment: 'barbell',
  primary_muscles: ['quadriceps'],
  secondary_muscles: [],
  archived_at: null,
  ...overrides,
});

describe('exercise search (2.5 review ordering)', () => {
  const exercises = [
    ex('lib-full', 'Barbell Full Squat'),
    ex('lib-front', 'Front Barbell Squat'),
    ex('lib-used', 'Barbell Squat'),
    ex('mine-used', 'Squat', { user_id: 'me' }),
    ex('mine-unused', 'Squat Jumps', { user_id: 'me', kind: 'cardio', equipment: null }),
    ex('lib-row', 'Rowing, Stationary', {
      kind: 'cardio',
      equipment: 'machine',
      primary_muscles: ['quadriceps'],
    }),
    ex('gone', 'Old Squat', { user_id: 'me', archived_at: '2026-11-01' }),
    ex('lib-bench', 'Bench Press', { primary_muscles: ['chest'], secondary_muscles: ['triceps'] }),
  ];
  const summaries = new Map([
    ['mine-used', { exercise_id: 'mine-used', set_count: 40, last_on: '2026-11-20' }],
    ['lib-used', { exercise_id: 'lib-used', set_count: 3, last_on: '2026-11-23' }],
  ]);
  const ids = (query: string, extra = {}) =>
    searchExercises(exercises, summaries, { query, muscle: null, equipment: null, ...extra }).map(
      (hit) => hit.exercise.id,
    );

  it('puts my custom exercises with history above library matches', () => {
    expect(ids('squat')).toEqual(['mine-used', 'lib-used', 'lib-full', 'lib-front', 'mine-unused']);
  });

  it('matches every word, in any order, ignoring case; never archived', () => {
    expect(ids('SQUAT barbell')).toEqual(['lib-used', 'lib-full', 'lib-front']);
    expect(ids('old')).toEqual([]);
  });

  it('filters by kind, muscle and equipment, and can exclude one exercise', () => {
    expect(ids('', { kinds: ['cardio'] })).toEqual(['lib-row', 'mine-unused']);
    expect(ids('', { muscle: 'triceps' })).toEqual(['lib-bench']);
    expect(ids('', { equipment: 'machine' })).toEqual(['lib-row']);
    expect(ids('squat', { excludeId: 'mine-used' })[0]).toBe('lib-used');
    expect(ids('squat', { libraryOnly: true })).not.toContain('mine-used');
  });

  it('offers the filter values present in the data', () => {
    expect(facetOptions(exercises)).toEqual({
      muscles: ['chest', 'quadriceps'],
      equipment: ['barbell', 'machine'],
    });
  });
});

describe('sparkline (best e1RM per session)', () => {
  it('takes the best working e1RM of each session, oldest first', () => {
    const points = bestE1rmPerSession([
      { occurred_on: '2026-11-20', sets: [working(5, 100), working(8, 80)] },
      {
        occurred_on: '2026-11-13',
        sets: [{ ...working(1, 200), set_type: 'warmup' }, working(5, 90)],
      },
      { occurred_on: '2026-11-06', sets: [working(15, 50)] },
    ]);
    expect(points).toEqual([
      { day: '2026-11-13', valueCentiKg: 10500 },
      { day: '2026-11-20', valueCentiKg: 11667 },
    ]);
  });

  it('scales into the box, higher values drawn higher', () => {
    const points = sparklinePoints([100, 200], 300, 72, 6);
    expect(points).toEqual([
      { x: 6, y: 66 },
      { x: 294, y: 6 },
    ]);
    expect(sparklinePath(points)).toBe('M6.0,66.0 L294.0,6.0');
    expect(sparklinePoints([5, 5], 300, 72, 6).map((p) => p.y)).toEqual([36, 36]);
  });
});

describe('workout draft (one-tap repeat sets)', () => {
  const last: DraftSet[] = [
    { id: 'a', setType: 'warmup', reps: 10, weightKg: 40, durationS: null, distanceM: null },
    { id: 'b', setType: 'working', reps: 8, weightKg: 60, durationS: null, distanceM: null },
    { id: 'c', setType: 'working', reps: 8, weightKg: 60, durationS: null, distanceM: null },
  ];
  const squat = { id: 'ex-1', name: 'Barbell Squat', kind: 'strength' as const };

  it('prefills from last time and follows it set by set, then repeats', () => {
    let draft = addExercise(createDraft('u1', 0, 'Legs'), squat, last, 'k');
    const tap = (id: string) => {
      const result = logSet(draft, 'k', id);
      draft = result.draft;
      return result.logged;
    };
    expect(tap('1')).toMatchObject({ setType: 'warmup', reps: 10, weightKg: 40 });
    expect(tap('2')).toMatchObject({ setType: 'working', reps: 8, weightKg: 60 });
    expect(tap('3')).toMatchObject({ setType: 'working', reps: 8, weightKg: 60 });
    // Past the end of last session: one more tap repeats the last set.
    expect(tap('4')).toMatchObject({ setType: 'working', reps: 8, weightKg: 60 });
    expect(draft.exercises[0]?.sets).toHaveLength(4);
  });

  it('refuses invalid sets and accepts edits', () => {
    let draft = addExercise(createDraft('u1', 0, 'Legs'), squat, [], 'k');
    expect(logSet(draft, 'k', 'x').logged).toBeNull();
    draft = updateInputs(draft, 'k', { reps: '5', weight: '102,5' });
    expect(logSet(draft, 'k', 'x').logged).toMatchObject({ reps: 5, weightKg: 102.5 });
    expect(
      parseInputs(
        { setType: 'working', reps: '5', weight: '60.125', minutes: '', distanceKm: '' },
        'strength',
        'x',
      ),
    ).toBeNull();
    expect(
      parseInputs(
        { setType: 'working', reps: '0', weight: '', minutes: '', distanceKm: '' },
        'strength',
        'x',
      ),
    ).toBeNull();
  });

  it('takes cardio as duration and/or distance', () => {
    const cardio = parseInputs(
      { setType: 'working', reps: '', weight: '', minutes: '20', distanceKm: '3.2' },
      'cardio',
      'x',
    );
    expect(cardio).toEqual({
      id: 'x',
      setType: 'working',
      reps: null,
      weightKg: null,
      durationS: 1200,
      distanceM: 3200,
    });
    expect(
      parseInputs(
        { setType: 'working', reps: '', weight: '', minutes: '', distanceKm: '' },
        'cardio',
        'x',
      ),
    ).toBeNull();
  });

  it('builds the 2.6 log_workout payload in log order', () => {
    let draft = addExercise(createDraft('u1', 0, 'Legs'), squat, last, 'k');
    draft = logSet(draft, 'k', '1').draft;
    draft = logSet(draft, 'k', '2').draft;
    expect(toPayload(draft)).toEqual([
      {
        exercise_id: 'ex-1',
        set_type: 'warmup',
        reps: 10,
        weight_kg: 40,
        duration_s: null,
        distance_m: null,
      },
      {
        exercise_id: 'ex-1',
        set_type: 'working',
        reps: 8,
        weight_kg: 60,
        duration_s: null,
        distance_m: null,
      },
    ]);
  });

  it('survives a reload for the same hunter only', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
    const draft = addExercise(createDraft('u1', 5, 'Legs'), squat, last, 'k');
    saveDraft(storage, draft);
    expect(loadDraft(storage, 'u1')).toEqual(draft);
    expect(loadDraft(storage, 'someone-else')).toBeNull();
    store.set(DRAFT_STORAGE_KEY, '{broken');
    expect(loadDraft(storage, 'u1')).toBeNull();
    saveDraft(storage, null);
    expect(store.has(DRAFT_STORAGE_KEY)).toBe(false);
  });
});

const award = (xp: number, extra: Record<string, unknown> = {}) => ({
  event_id: 'e',
  xp,
  full_xp: xp,
  capped: false,
  stat_xp: { STR: Math.floor(xp / 2), AGI: 0, VIT: 0, INT: 0, SENSE: 0 },
  weakened: false,
  free_points: 0,
  debt_repayment: 0,
  ...extra,
});

describe('workout toasts (brief 4.6)', () => {
  const reply = workoutMutationSchema.parse({
    workout_id: 'w',
    occurred_on: '2026-11-25',
    set_count: 4,
    counted_sets: 4,
    auto_workout: { evaluated: true, action: 'unchanged' },
    workout_award: award(8),
    records: [
      {
        record_id: 'r1',
        exercise_id: 'x',
        exercise_name: 'Squat',
        pr_kind: 'e1rm',
        value_centi: 9250,
        baseline: false,
        set_id: 's1',
        bonus_event_id: 'b1',
      },
      {
        record_id: 'r2',
        exercise_id: 'x',
        exercise_name: 'Squat',
        pr_kind: 'max_weight',
        value_centi: 8000,
        baseline: false,
        set_id: 's1',
        bonus_event_id: 'b1',
      },
      {
        record_id: 'r3',
        exercise_id: 'y',
        exercise_name: 'Bench',
        pr_kind: 'e1rm',
        value_centi: 7000,
        baseline: true,
        set_id: 's2',
        bonus_event_id: null,
      },
      {
        record_id: 'r4',
        exercise_id: 'z',
        exercise_name: 'Deadlift',
        pr_kind: 'e1rm',
        value_centi: 18000,
        baseline: false,
        set_id: 's3',
        bonus_event_id: null,
      },
    ],
    pr_bonuses: [{ ...award(25, { debt_repayment: 12 }), set_id: 's1', exercise_name: 'Squat' }],
    bosses_defeated: [{ ...award(100, { free_points: 1 }), boss_id: 'boss', boss_name: 'Igris' }],
  });

  it('raises set XP, one record toast per set, an unpaid note, and the boss', () => {
    expect(workoutToasts(reply)).toEqual([
      { title: '[Workout recorded]', lines: ['+8 XP · STR +4'] },
      {
        title: '[NEW RECORD]',
        lines: ['Squat e1RM 92.5 kg · max 80 kg · +25 XP', '12 XP went to your XP Debt'],
      },
      {
        title: '[NEW RECORD]',
        lines: [
          'Deadlift e1RM 180 kg',
          `Record kept. Today's ${String(GAME_CONFIG.gym.pr.maxBonusesPerDay)} record bonuses are already paid.`,
        ],
      },
      { title: '[BOSS DEFEATED]', lines: ['Igris · +100 XP · +1 free point'] },
    ]);
  });

  it('says so when the daily set allowance is already used', () => {
    const none = workoutMutationSchema.parse({
      workout_id: 'w',
      occurred_on: '2026-11-25',
      set_count: 3,
      counted_sets: 0,
      workout_award: null,
      auto_workout: { evaluated: true, action: 'unchanged' },
    });
    expect(workoutToasts(none)[0]?.lines[0]).toContain(
      String(GAME_CONFIG.gym.maxWorkingSetsPerDay),
    );
  });
});

describe('dev API host over home WiFi', () => {
  const local = 'http://127.0.0.1:54321';
  const phonePage = 'http://192.168.1.20:5173';
  it('goes through the dev server proxy on the page origin when opened by LAN address', () => {
    expect(resolveSupabaseUrl(local, phonePage, true)).toBe('http://192.168.1.20:5173/supabase');
  });
  it('changes nothing on the PC itself, for hosted URLs, or in a production build', () => {
    expect(resolveSupabaseUrl(local, 'http://localhost:5173', true)).toBe(local);
    expect(resolveSupabaseUrl('https://abc.supabase.co', phonePage, true)).toBe(
      'https://abc.supabase.co',
    );
    expect(resolveSupabaseUrl(local, phonePage, false)).toBe(local);
    expect(resolveSupabaseUrl(local, null, true)).toBe(local);
  });
});

describe('unfinished workout note (2.7 review)', () => {
  const note = systemCopy.gym.unfinishedTrain;
  const base = { tracking: 'auto_workout', trainCompleted: false, hasDraft: true, note };

  it('shows on the open Train quest while a draft exists', () => {
    expect(unfinishedWorkoutNote(base)).toBe(note);
    expect(note).toBe('Unfinished workout — finish it to complete Train');
  });

  it('stays silent without a draft, once Train is complete, or on other quests', () => {
    expect(unfinishedWorkoutNote({ ...base, hasDraft: false })).toBeNull();
    expect(unfinishedWorkoutNote({ ...base, trainCompleted: true })).toBeNull();
    expect(unfinishedWorkoutNote({ ...base, tracking: 'auto_protein_min' })).toBeNull();
  });

  it('names the configured rollover in the logger warning', () => {
    const hour = String(GAME_CONFIG.dayRollover.startHour).padStart(2, '0');
    expect(systemCopy.gym.finishBefore).toBe(`Finish before ${hour}:00 to count for today`);
    expect(systemCopy.gym.countsForToday).toBe('This workout will count for today.');
  });
});
