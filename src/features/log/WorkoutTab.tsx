import { useState, type FormEvent } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { SystemButton } from '../../components/SystemButton';
import { SystemField, SystemInput } from '../../components/SystemField';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { useToast } from '../../components/toastContext';
import { systemCopy } from '../../copy/system';
import {
  awardFromOutcome,
  useDeleteWorkout,
  useLogWorkout,
  type AutoOutcome,
} from '../../lib/mutations/logs';
import { awardedStats, modifierLines } from '../../lib/mutations/quests';
import { useWorkouts } from '../../lib/queries/logs';
import type { HunterSnapshot } from '../../lib/schemas';
import { systemMessage } from '../../lib/systemError';

interface SetDraft {
  exercise: string;
  reps: string;
  weight: string;
}

const emptySet: SetDraft = { exercise: '', reps: '', weight: '' };

export function WorkoutTab({ snapshot }: { snapshot: HunterSnapshot }) {
  const day = snapshot.game_today;
  const toast = useToast();

  const workouts = useWorkouts(day);
  const logWorkout = useLogWorkout(day);
  const deleteWorkout = useDeleteWorkout(day);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [sets, setSets] = useState<SetDraft[]>([{ ...emptySet }]);
  const [formError, setFormError] = useState<string | null>(null);

  const busy = logWorkout.isPending || deleteWorkout.isPending;

  function reportAuto(outcome: AutoOutcome) {
    const award = awardFromOutcome(outcome);
    if (award !== null) {
      const stats = awardedStats(award)
        .map((entry) => `${entry.id} +${entry.amount}`)
        .join(' · ');
      toast.show({
        title: systemCopy.quests.toastTitle,
        lines: [
          award.capped && award.xp === 0
            ? systemCopy.quests.capped
            : `+${award.xp} XP${stats === '' ? '' : ` · ${stats}`}`,
          ...modifierLines(award),
        ],
      });
    } else if (outcome.action === 'reversed') {
      toast.show({ title: systemCopy.quests.undoneTitle, lines: [systemCopy.log.autoReversed] });
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (title.trim() === '') {
      setFormError(systemCopy.errors.generic);
      return;
    }

    const payload = sets
      .filter((set) => set.exercise.trim() !== '' && set.reps.trim() !== '')
      .map((set) => ({
        exercise_name: set.exercise.trim(),
        reps: Number(set.reps),
        weight_kg: set.weight.trim() === '' ? null : Number(set.weight),
      }));

    logWorkout.mutate(
      { title: title.trim(), notes: notes.trim() === '' ? null : notes.trim(), sets: payload },
      {
        onSuccess: (result) => {
          setTitle('');
          setNotes('');
          setSets([{ ...emptySet }]);
          reportAuto(result.auto_workout);
        },
        onError: (error) => {
          setFormError(systemMessage(error));
        },
      },
    );
  }

  function updateSet(index: number, patch: Partial<SetDraft>) {
    setSets((current) =>
      current.map((set, position) => (position === index ? { ...set, ...patch } : set)),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {workouts.isPending ? (
        <SystemLoading />
      ) : workouts.isError ? (
        <SystemErrorPanel
          message={systemMessage(workouts.error, systemCopy.errors.load)}
          onRetry={() => {
            void workouts.refetch();
          }}
        />
      ) : workouts.data === undefined || workouts.data.length === 0 ? (
        <EmptyState message={systemCopy.empty.workouts} />
      ) : (
        <ul className="flex flex-col divide-y divide-system/10">
          {workouts.data.map((workout) => (
            <li key={workout.id} className="flex flex-col gap-1 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-hunter">
                    {workout.title}
                  </span>
                  {workout.notes !== null && (
                    <span className="truncate text-xs text-steel">{workout.notes}</span>
                  )}
                </div>
                <SystemButton
                  tone="ghost"
                  className="min-h-9 shrink-0 px-2 text-[0.625rem]"
                  disabled={busy}
                  onClick={() => {
                    deleteWorkout.mutate(workout.id, {
                      onSuccess: (result) => {
                        reportAuto(result.auto_workout);
                      },
                      onError: (error) => {
                        setFormError(systemMessage(error));
                      },
                    });
                  }}
                >
                  {systemCopy.log.deleteEntry}
                </SystemButton>
              </div>

              {workout.workout_sets.length > 0 && (
                <ul className="flex flex-col gap-0.5 pl-1">
                  {workout.workout_sets.map((set) => (
                    <li
                      key={set.id}
                      className="font-display text-[0.6875rem] text-steel"
                      data-readout
                    >
                      {set.set_index}. {set.exercise_name} — {set.reps} ×{' '}
                      {set.weight_kg === null ? '–' : `${set.weight_kg} ${systemCopy.log.weight}`}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <form className="flex flex-col gap-3 border-t border-system/15 pt-4" onSubmit={handleSubmit}>
        <SystemField label={systemCopy.log.workoutTitle} htmlFor="workout-title">
          <SystemInput
            id="workout-title"
            value={title}
            maxLength={80}
            placeholder={systemCopy.log.workoutTitlePlaceholder}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
            disabled={busy}
          />
        </SystemField>

        <SystemField label={systemCopy.log.workoutNotes} htmlFor="workout-notes">
          <SystemInput
            id="workout-notes"
            value={notes}
            maxLength={200}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
            disabled={busy}
          />
        </SystemField>

        <fieldset className="flex flex-col gap-2">
          <legend className="font-display text-xs font-semibold tracking-[0.18em] text-steel uppercase">
            {systemCopy.log.sets}
          </legend>
          {sets.map((set, index) => (
            // Sizes live on wrappers: an <input> has an intrinsic minimum
            // width, so sizing the inputs directly let reps and kg crush the
            // exercise field to a sliver at 375px.
            <div key={index} className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <SystemInput
                  aria-label={`${systemCopy.log.exercise} ${index + 1}`}
                  placeholder={systemCopy.log.exercise}
                  value={set.exercise}
                  onChange={(event) => {
                    updateSet(index, { exercise: event.target.value });
                  }}
                  disabled={busy}
                />
              </div>
              <div className="w-16 shrink-0">
                <SystemInput
                  aria-label={`${systemCopy.log.reps} ${index + 1}`}
                  placeholder={systemCopy.log.reps}
                  type="number"
                  inputMode="numeric"
                  value={set.reps}
                  onChange={(event) => {
                    updateSet(index, { reps: event.target.value });
                  }}
                  disabled={busy}
                />
              </div>
              <div className="w-16 shrink-0">
                <SystemInput
                  aria-label={`${systemCopy.log.weight} ${index + 1}`}
                  placeholder={systemCopy.log.weight}
                  type="number"
                  inputMode="decimal"
                  value={set.weight}
                  onChange={(event) => {
                    updateSet(index, { weight: event.target.value });
                  }}
                  disabled={busy}
                />
              </div>
              {sets.length > 1 && (
                <SystemButton
                  tone="ghost"
                  className="min-h-9 shrink-0 px-2 text-[0.625rem]"
                  aria-label={`${systemCopy.log.removeSet} ${index + 1}`}
                  disabled={busy}
                  onClick={() => {
                    setSets((current) => current.filter((_, position) => position !== index));
                  }}
                >
                  ×
                </SystemButton>
              )}
            </div>
          ))}

          <SystemButton
            tone="ghost"
            className="min-h-9 self-start px-3 text-xs"
            disabled={busy}
            onClick={() => {
              setSets((current) => [...current, { ...emptySet }]);
            }}
          >
            {systemCopy.log.addSet}
          </SystemButton>
        </fieldset>

        {formError !== null && (
          <p
            role="alert"
            className="border border-penalty/50 bg-penalty-bg/80 px-3 py-2 text-sm text-penalty-text"
          >
            {formError}
          </p>
        )}

        <SystemButton type="submit" disabled={busy} className="w-full">
          {logWorkout.isPending ? systemCopy.log.working : systemCopy.log.logWorkout}
        </SystemButton>
      </form>
    </div>
  );
}
