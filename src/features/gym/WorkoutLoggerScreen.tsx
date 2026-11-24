import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SystemButton } from '../../components/SystemButton';
import { SystemField, SystemInput } from '../../components/SystemField';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { SystemWindow } from '../../components/SystemWindow';
import { useToast } from '../../components/toastContext';
import { systemCopy } from '../../copy/system';
import { draftFinishNotice, GAME_CONFIG } from '../../game';
import { useNow } from '../../lib/useNow';
import { useAuth } from '../auth/authContext';
import { useLogWorkout } from '../../lib/mutations/logs';
import { useHunterSnapshot } from '../../lib/queries/hunterSnapshot';
import { fetchExerciseSessions, useRestTimerSetting } from '../../lib/queries/gym';
import { systemMessage } from '../../lib/systemError';
import { ExercisePicker, type PickedExercise } from './ExercisePicker';
import { autoQuestToast, workoutToasts } from './gymToasts';
import { sessionSummary, setLabel, type SetMeasures } from './gymText';
import { persistDraft, readDraft } from './draftStore';
import { startRestTimerNow } from './restTimerStore';
import {
  addExercise,
  createDraft,
  loggedSetCount,
  logSet,
  newDraftId,
  removeExercise,
  removeSet,
  toPayload,
  updateInputs,
  type DraftExercise,
  type DraftSet,
  type WorkoutDraft,
} from './workoutDraft';

const copy = systemCopy.gym;

function asMeasures(set: DraftSet): SetMeasures {
  return {
    set_type: set.setType,
    reps: set.reps,
    weight_kg: set.weightKg,
    duration_s: set.durationS,
    distance_m: set.distanceM,
  };
}

/**
 * Logger v2 (brief 4.6). Start a workout, add exercises from the picker, log
 * sets - prefilled from last time, so repeating it is one tap per set - with
 * the rest timer starting after each working set. Finish sends the whole
 * workout to log_workout in one call.
 */
export function WorkoutLoggerScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const snapshot = useHunterSnapshot();

  if (userId === undefined || snapshot.isPending) return <SystemLoading />;
  if (snapshot.isError) {
    return (
      <SystemErrorPanel
        message={systemMessage(snapshot.error, systemCopy.errors.load)}
        onRetry={() => {
          void snapshot.refetch();
        }}
      />
    );
  }
  if (snapshot.data === null) return <SystemLoading />;
  return (
    <Logger
      userId={userId}
      day={snapshot.data.game_today}
      timeZone={snapshot.data.hunter.timezone}
    />
  );
}

function Logger({ userId, day, timeZone }: { userId: string; day: string; timeZone: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const logWorkout = useLogWorkout(day);
  const restSetting = useRestTimerSetting();

  const [draft, setDraft] = useState<WorkoutDraft>(
    () => readDraft(userId) ?? createDraft(userId, Date.now(), copy.defaultTitle),
  );
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidKey, setInvalidKey] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Every change is kept, so leaving the screen (or a reload) loses nothing.
  useEffect(() => {
    persistDraft(draft);
  }, [draft]);

  const setCount = loggedSetCount(draft);
  // 2.7 review: near the rollover, and for a draft carried over from an
  // earlier game day, say which day the workout will count for.
  const now = useNow(15_000);
  const notice = draftFinishNotice(now, new Date(draft.startedAt), timeZone);

  async function pick(exercise: PickedExercise) {
    setPicking(false);
    setAdding(true);
    setError(null);
    let lastSets: DraftSet[] = [];
    try {
      const [last] = await fetchExerciseSessions(exercise.id, 1);
      lastSets = (last?.sets ?? []).map((set) => ({
        id: newDraftId(),
        setType: set.set_type === 'warmup' ? 'warmup' : 'working',
        reps: set.reps,
        weightKg: set.weight_kg,
        durationS: set.duration_s,
        distanceM: set.distance_m,
      }));
    } catch {
      // No prefill is better than no exercise: carry on empty.
    }
    setDraft((current) => addExercise(current, exercise, lastSets, newDraftId()));
    setAdding(false);
  }

  function log(exercise: DraftExercise) {
    const { draft: next, logged } = logSet(draft, exercise.key, newDraftId());
    if (logged === null) {
      setInvalidKey(exercise.key);
      return;
    }
    setInvalidKey(null);
    setDraft(next);
    if (logged.setType === 'working') {
      startRestTimerNow(restSetting.data ?? GAME_CONFIG.gym.restTimer.defaultSeconds);
    }
  }

  function finish() {
    setError(null);
    if (setCount === 0) {
      setError(copy.finishEmpty);
      return;
    }
    logWorkout.mutate(
      { title: draft.title.trim() || copy.defaultTitle, notes: null, sets: toPayload(draft) },
      {
        onSuccess: (result) => {
          persistDraft(null);
          const auto = autoQuestToast(result.auto_workout);
          if (auto !== null) toast.show(auto);
          for (const item of workoutToasts(result)) toast.show(item);
          void navigate('/log?tab=workout');
        },
        onError: (mutationError) => {
          setError(systemMessage(mutationError));
        },
      },
    );
  }

  const started = new Date(draft.startedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <SystemWindow title={systemCopy.windows.workout} headerAside={copy.started(started)}>
        <SystemField label={copy.title} htmlFor="workout-title">
          <SystemInput
            id="workout-title"
            value={draft.title}
            maxLength={80}
            onChange={(event) => {
              setDraft((current) => ({ ...current, title: event.target.value }));
            }}
          />
        </SystemField>
      </SystemWindow>

      {draft.exercises.length === 0 && (
        <p className="py-2 text-center text-sm text-steel">{copy.noExercises}</p>
      )}

      {draft.exercises.map((exercise) => (
        <ExerciseCard
          key={exercise.key}
          exercise={exercise}
          invalid={invalidKey === exercise.key}
          onChange={(patch) => {
            setInvalidKey(null);
            setDraft((current) => updateInputs(current, exercise.key, patch));
          }}
          onLog={() => {
            log(exercise);
          }}
          onRemoveSet={(setId) => {
            setDraft((current) => removeSet(current, exercise.key, setId));
          }}
          onRemove={() => {
            setDraft((current) => removeExercise(current, exercise.key));
          }}
        />
      ))}

      <SystemButton
        tone="ghost"
        className="w-full"
        disabled={adding || logWorkout.isPending}
        onClick={() => {
          setPicking(true);
        }}
      >
        {adding ? systemCopy.states.loading : `+ ${copy.addExercise}`}
      </SystemButton>

      {error !== null && (
        <p
          role="alert"
          className="border border-penalty/50 bg-penalty-bg/80 px-3 py-2 text-sm text-penalty-text"
        >
          {error}
        </p>
      )}

      {notice.finishSoon && (
        <p role="status" className="text-center text-sm text-penalty-text">
          {copy.finishBefore}
        </p>
      )}
      {notice.startedOnEarlierDay && (
        <p role="status" className="text-center text-sm text-system-glow">
          {copy.countsForToday}
        </p>
      )}
      <SystemButton className="w-full" disabled={logWorkout.isPending} onClick={finish}>
        {logWorkout.isPending ? copy.finishing : `${copy.finish} · ${copy.sets(setCount)}`}
      </SystemButton>
      <SystemButton
        tone="ghost"
        className="self-center"
        disabled={logWorkout.isPending}
        onClick={() => {
          setConfirmDiscard(true);
        }}
      >
        {copy.discard}
      </SystemButton>

      {picking && (
        <ExercisePicker
          title={systemCopy.windows.exercises}
          onPick={(exercise) => {
            void pick(exercise);
          }}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDiscard}
        title={copy.discardTitle}
        body={copy.discardBody}
        confirmLabel={copy.discard}
        cancelLabel={copy.keep}
        onConfirm={() => {
          persistDraft(null);
          setConfirmDiscard(false);
          void navigate('/log?tab=workout');
        }}
        onCancel={() => {
          setConfirmDiscard(false);
        }}
      />
    </>
  );
}

interface ExerciseCardProps {
  exercise: DraftExercise;
  invalid: boolean;
  onChange: (patch: Partial<DraftExercise['inputs']>) => void;
  onLog: () => void;
  onRemoveSet: (setId: string) => void;
  onRemove: () => void;
}

function ExerciseCard({
  exercise,
  invalid,
  onChange,
  onLog,
  onRemoveSet,
  onRemove,
}: ExerciseCardProps) {
  const { inputs } = exercise;
  const cardio = exercise.kind === 'cardio';
  const warmup = inputs.setType === 'warmup';
  const lastTime =
    exercise.lastSets.length > 0
      ? copy.lastTime(sessionSummary(exercise.lastSets.map(asMeasures)))
      : // Only exercises that hold records get a baseline (strength, config).
        GAME_CONFIG.gym.pr.kinds.includes(exercise.kind)
        ? copy.firstTime
        : copy.firstTimePlain;

  return (
    <SystemWindow
      animate={false}
      title={exercise.name.toUpperCase()}
      headerAside={
        <button
          type="button"
          aria-label={`${copy.removeExercise}: ${exercise.name}`}
          className="min-h-9 min-w-9 font-display text-sm text-steel"
          onClick={onRemove}
        >
          ×
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs text-steel">
          <Link
            to={`/exercises/${exercise.exerciseId}`}
            className="underline-offset-2 hover:underline"
          >
            {lastTime}
          </Link>
        </p>

        {exercise.sets.length > 0 && (
          <ol className="flex flex-col">
            {exercise.sets.map((set, index) => (
              <li key={set.id} className="flex items-center gap-2 py-0.5">
                <span className="w-6 font-display text-xs text-steel" data-readout>
                  {set.setType === 'warmup' ? copy.warmupShort : String(index + 1)}
                </span>
                <span className="flex-1 font-display text-sm text-hunter" data-readout>
                  {setLabel(asMeasures(set))}
                </span>
                <button
                  type="button"
                  aria-label={copy.removeSet(index + 1)}
                  className="min-h-8 min-w-8 text-steel"
                  onClick={() => {
                    onRemoveSet(set.id);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="flex items-end gap-1.5">
          <button
            type="button"
            aria-pressed={warmup}
            className={`min-h-11 w-12 shrink-0 border font-display text-xs font-semibold ${
              warmup ? 'border-system-glow text-system-glow' : 'border-steel/40 text-steel'
            }`}
            onClick={() => {
              onChange({ setType: warmup ? 'working' : 'warmup' });
            }}
          >
            {warmup ? copy.warmupShort : copy.workingShort}
          </button>
          {cardio ? (
            <>
              <NumberBox
                label={copy.minutes}
                value={inputs.minutes}
                decimal
                onChange={(minutes) => {
                  onChange({ minutes });
                }}
              />
              <NumberBox
                label={copy.km}
                value={inputs.distanceKm}
                decimal
                onChange={(distanceKm) => {
                  onChange({ distanceKm });
                }}
              />
            </>
          ) : (
            <>
              <NumberBox
                label={copy.reps}
                value={inputs.reps}
                onChange={(reps) => {
                  onChange({ reps });
                }}
              />
              <NumberBox
                label={copy.kg}
                value={inputs.weight}
                decimal
                onChange={(weight) => {
                  onChange({ weight });
                }}
              />
            </>
          )}
        </div>
        {invalid && (
          <p role="alert" className="text-xs text-penalty-text">
            {copy.setInvalid}
          </p>
        )}
        <SystemButton className="w-full" onClick={onLog}>
          {copy.logSet}
        </SystemButton>
      </div>
    </SystemWindow>
  );
}

function NumberBox({
  label,
  value,
  decimal = false,
  onChange,
}: {
  label: string;
  value: string;
  decimal?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="font-display text-[0.625rem] tracking-[0.16em] text-steel uppercase">
        {label}
      </span>
      <SystemInput
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value}
        className="text-center"
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </label>
  );
}
