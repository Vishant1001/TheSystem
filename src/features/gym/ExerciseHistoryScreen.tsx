import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { SystemButton } from '../../components/SystemButton';
import { SystemLink } from '../../components/SystemLink';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { SystemWindow } from '../../components/SystemWindow';
import { useToast } from '../../components/toastContext';
import { systemCopy } from '../../copy/system';
import { useMergeExercise } from '../../lib/mutations/gym';
import {
  useExerciseSessions,
  useExerciseSummaries,
  useExercises,
  usePersonalRecords,
  type Exercise,
} from '../../lib/queries/gym';
import { systemMessage } from '../../lib/systemError';
import { ExercisePicker, type PickedExercise } from './ExercisePicker';
import { formatCentiKg, sessionSummary } from './gymText';
import { bestE1rmPerSession, sparklinePath, sparklinePoints } from './sparkline';

const copy = systemCopy.gym;

/** Brief 4.6: sessions and the best e1RM per session; merge for custom exercises. */
export function ExerciseHistoryScreen() {
  const { exerciseId } = useParams();
  const exercises = useExercises();

  if (exercises.isPending) return <SystemLoading />;
  if (exercises.isError) {
    return (
      <SystemErrorPanel
        message={systemMessage(exercises.error, systemCopy.errors.load)}
        onRetry={() => {
          void exercises.refetch();
        }}
      />
    );
  }
  const exercise = exercises.data.find((candidate) => candidate.id === exerciseId);
  if (exercise === undefined) {
    return (
      <SystemWindow title={systemCopy.windows.exerciseRecord}>
        <EmptyState
          message={copy.exerciseNotFound}
          action={
            <SystemLink to="/log?tab=workout" tone="ghost">
              {systemCopy.quests.back}
            </SystemLink>
          }
        />
      </SystemWindow>
    );
  }
  return <History exercise={exercise} />;
}

function History({ exercise }: { exercise: Exercise }) {
  const navigate = useNavigate();
  const toast = useToast();
  const sessions = useExerciseSessions(exercise.id);
  const records = usePersonalRecords(exercise.id);
  const summaries = useExerciseSummaries();
  const merge = useMergeExercise();
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<PickedExercise | null>(null);
  const [error, setError] = useState<string | null>(null);

  const custom = exercise.user_id !== null;
  const canMerge = custom && exercise.archived_at === null;
  const setCount = summaries.data?.get(exercise.id)?.set_count ?? 0;
  const strength = exercise.kind === 'strength';

  const points = bestE1rmPerSession(
    (sessions.data ?? []).map((session) => ({
      occurred_on: session.occurred_on,
      sets: session.sets,
    })),
  );

  return (
    <>
      <SystemWindow
        title={systemCopy.windows.exerciseRecord}
        headerAside={[custom ? copy.custom : null, copy.kinds[exercise.kind]]
          .filter(Boolean)
          .join(' · ')}
      >
        <h1 className="font-display text-lg font-semibold text-hunter">{exercise.name}</h1>
        {exercise.merged_into_id !== null && (
          <div className="pt-1 text-xs text-steel">
            <p>{copy.mergedArchived}</p>
            <SystemLink
              to={`/exercises/${exercise.merged_into_id}`}
              tone="ghost"
              className="mt-2 w-full"
            >
              {copy.history}
            </SystemLink>
          </div>
        )}

        {strength && records.isError && (
          <div className="mt-3">
            <SystemErrorPanel
              message={systemMessage(records.error, systemCopy.errors.load)}
              onRetry={() => {
                void records.refetch();
              }}
            />
          </div>
        )}
        {strength && !records.isError && (
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div className="border border-system/20 px-3 py-2">
              <dt className="text-xs text-steel">{copy.bestE1rm}</dt>
              <dd className="font-display text-lg text-system-glow" data-readout>
                {records.isPending ? copy.loadingValue : bestLabel(records.data.e1rm)}
              </dd>
            </div>
            <div className="border border-system/20 px-3 py-2">
              <dt className="text-xs text-steel">{copy.bestWeight}</dt>
              <dd className="font-display text-lg text-system-glow" data-readout>
                {records.isPending ? copy.loadingValue : bestLabel(records.data.maxWeight)}
              </dd>
            </div>
          </dl>
        )}

        {strength && points.length >= 2 && <Sparkline values={points.map((p) => p.valueCentiKg)} />}
      </SystemWindow>

      <SystemWindow title={copy.sessions.toUpperCase()}>
        {sessions.isPending ? (
          <SystemLoading />
        ) : sessions.isError ? (
          <SystemErrorPanel
            message={systemMessage(sessions.error, systemCopy.errors.load)}
            onRetry={() => {
              void sessions.refetch();
            }}
          />
        ) : sessions.data.length === 0 ? (
          <EmptyState message={copy.noSessions} />
        ) : (
          <ul className="flex flex-col divide-y divide-system/10">
            {sessions.data.map((session) => (
              <li key={session.workout_id} className="flex flex-col py-2">
                <span className="flex justify-between gap-2 text-xs text-steel">
                  <span className="truncate">{session.title}</span>
                  <span data-readout>{session.occurred_on}</span>
                </span>
                <span className="font-display text-sm text-hunter" data-readout>
                  {sessionSummary(session.sets)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SystemWindow>

      {canMerge && (
        <SystemWindow title={copy.mergeTitle}>
          <p className="mb-3 text-sm text-steel">{copy.mergeHint}</p>
          {summaries.isError ? (
            // The confirmation must state how many sets move; without the
            // count there is no merge.
            <SystemErrorPanel
              message={systemMessage(summaries.error, systemCopy.errors.load)}
              onRetry={() => {
                void summaries.refetch();
              }}
            />
          ) : (
            <SystemButton
              tone="ghost"
              className="w-full"
              disabled={summaries.isPending}
              onClick={() => {
                setPicking(true);
              }}
            >
              {summaries.isPending ? systemCopy.states.loading : copy.merge}
            </SystemButton>
          )}
          {error !== null && (
            <p role="alert" className="pt-2 text-sm text-penalty-text">
              {error}
            </p>
          )}
        </SystemWindow>
      )}

      {picking && (
        <ExercisePicker
          title={copy.merge.toUpperCase()}
          kinds={[exercise.kind]}
          excludeId={exercise.id}
          allowCreate={false}
          onPick={(picked) => {
            setPicking(false);
            setTarget(picked);
          }}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}

      <ConfirmDialog
        open={target !== null}
        title={copy.mergeTitle}
        detail={copy.sets(setCount)}
        body={copy.mergeBody(exercise.name, target?.name ?? '', setCount)}
        confirmLabel={copy.mergeConfirm}
        cancelLabel={copy.cancel}
        pending={merge.isPending}
        onConfirm={() => {
          if (target === null) return;
          setError(null);
          merge.mutate(
            { fromId: exercise.id, intoId: target.id },
            {
              onSuccess: (result) => {
                toast.show({
                  title: copy.mergedTitle,
                  lines: [copy.merged(result.sets_moved, result.into_name), copy.mergedRecords],
                });
                void navigate(`/exercises/${result.into_id}`, { replace: true });
              },
              onError: (mutationError) => {
                setError(systemMessage(mutationError));
              },
              onSettled: () => {
                setTarget(null);
              },
            },
          );
        }}
        onCancel={() => {
          setTarget(null);
        }}
      />
    </>
  );
}

function bestLabel(centi: number | null | undefined): string {
  return centi === null || centi === undefined ? copy.noRecord : `${formatCentiKg(centi)} kg`;
}

const W = 300;
const H = 72;
const PAD = 6;

function Sparkline({ values }: { values: number[] }) {
  const points = sparklinePoints(values, W, H, PAD);
  const last = points.at(-1);
  return (
    <figure className="mt-3">
      <figcaption className="pb-1 text-xs text-steel">{copy.trend}</figcaption>
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        className="h-18 w-full"
        role="img"
        aria-label={copy.trend}
      >
        <path
          d={sparklinePath(points)}
          fill="none"
          stroke="var(--color-system-glow)"
          strokeWidth="2"
        />
        {last !== undefined && (
          <circle cx={last.x} cy={last.y} r="3.5" fill="var(--color-system-glow)" />
        )}
      </svg>
    </figure>
  );
}
