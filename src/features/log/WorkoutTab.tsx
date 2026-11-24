import { useState } from 'react';
import { Link } from 'react-router';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { SystemButton } from '../../components/SystemButton';
import { SystemLink } from '../../components/SystemLink';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { useToast } from '../../components/toastContext';
import { systemCopy } from '../../copy/system';
import { useDeleteWorkout } from '../../lib/mutations/logs';
import { useWorkouts } from '../../lib/queries/logs';
import type { HunterSnapshot } from '../../lib/schemas';
import { systemMessage } from '../../lib/systemError';
import { setLabel } from '../gym/gymText';
import { autoQuestToast } from '../gym/gymToasts';
import { useWorkoutDraft } from '../gym/draftStore';

const copy = systemCopy.gym;

/**
 * Today's workouts, and the way into the logger (brief 4.6). Deleting a
 * workout takes back everything it earned, so it asks first.
 */
export function WorkoutTab({ snapshot }: { snapshot: HunterSnapshot }) {
  const day = snapshot.game_today;
  const toast = useToast();
  const workouts = useWorkouts(day);
  const deleteWorkout = useDeleteWorkout(day);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasDraft = useWorkoutDraft() !== null;

  return (
    <div className="flex flex-col gap-5">
      <SystemLink to="/log/workout" className="w-full">
        {hasDraft ? copy.resumeWorkout : copy.startWorkout}
      </SystemLink>

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
                  disabled={deleteWorkout.isPending}
                  onClick={() => {
                    setPendingDelete(workout.id);
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
                      {set.set_type === 'warmup' ? `${copy.warmupShort} ` : ''}
                      {set.exercise_id === null ? (
                        set.exercise_name
                      ) : (
                        <Link to={`/exercises/${set.exercise_id}`} className="text-hunter">
                          {set.exercise_name}
                        </Link>
                      )}{' '}
                      — {setLabel(set)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {error !== null && (
        <p
          role="alert"
          className="border border-penalty/50 bg-penalty-bg/80 px-3 py-2 text-sm text-penalty-text"
        >
          {error}
        </p>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={copy.deleteTitle}
        body={copy.deleteBody}
        confirmLabel={systemCopy.log.deleteEntry}
        cancelLabel={copy.cancel}
        pending={deleteWorkout.isPending}
        onConfirm={() => {
          if (pendingDelete === null) return;
          setError(null);
          deleteWorkout.mutate(pendingDelete, {
            onSuccess: (result) => {
              const auto = autoQuestToast(result.auto_workout);
              if (auto !== null) toast.show(auto);
            },
            onError: (mutationError) => {
              setError(systemMessage(mutationError));
            },
            onSettled: () => {
              setPendingDelete(null);
            },
          });
        }}
        onCancel={() => {
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
