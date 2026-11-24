import { useMemo, useState, type FormEvent } from 'react';
import { SystemButton } from '../../components/SystemButton';
import { SystemField, SystemInput, SystemSelect } from '../../components/SystemField';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';
import { EXERCISE_KINDS, type ExerciseKind } from '../../game';
import { useCreateExercise } from '../../lib/mutations/gym';
import { useExerciseSummaries, useExercises, type Exercise } from '../../lib/queries/gym';
import { systemMessage } from '../../lib/systemError';
import { facetOptions, searchExercises } from './exerciseSearch';

const copy = systemCopy.gym;
const SHOWN = 40;

export interface PickedExercise {
  id: string;
  name: string;
  kind: ExerciseKind;
}

interface ExercisePickerProps {
  title: string;
  /** Only these kinds are offered (and creatable). */
  kinds?: readonly ExerciseKind[] | undefined;
  excludeId?: string | undefined;
  libraryOnly?: boolean | undefined;
  allowCreate?: boolean | undefined;
  onPick: (exercise: PickedExercise) => void;
  onClose: () => void;
}

/**
 * Brief 4.6: search by name with muscle and equipment filters. Your own
 * exercises with history come first (2.5 review), then library ones you have
 * used, then the rest. A full-screen layer, so it works one-handed at 375 px.
 */
export function ExercisePicker({
  title,
  kinds,
  excludeId,
  libraryOnly,
  allowCreate = true,
  onPick,
  onClose,
}: ExercisePickerProps) {
  const exercises = useExercises();
  const summaries = useExerciseSummaries();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);

  const facets = useMemo(() => facetOptions(exercises.data ?? []), [exercises.data]);
  const hits = useMemo(
    () =>
      searchExercises(exercises.data ?? [], summaries.data ?? new Map(), {
        query,
        muscle,
        equipment,
        kinds,
        excludeId,
        libraryOnly,
      }),
    [exercises.data, summaries.data, query, muscle, equipment, kinds, excludeId, libraryOnly],
  );

  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-abyss/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pt-safe pb-10">
        <SystemWindow
          title={title}
          animate={false}
          headerAside={
            <button
              type="button"
              className="min-h-9 px-2 font-display text-xs tracking-[0.14em] text-steel uppercase"
              onClick={onClose}
            >
              {copy.close}
            </button>
          }
        >
          <div className="flex flex-col gap-2">
            <SystemInput
              type="search"
              aria-label={copy.search}
              placeholder={copy.search}
              value={query}
              autoFocus
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <SystemSelect
                  aria-label={copy.muscle}
                  value={muscle ?? ''}
                  onChange={(event) => {
                    setMuscle(event.target.value === '' ? null : event.target.value);
                  }}
                >
                  <option value="">
                    {copy.muscle}: {copy.any}
                  </option>
                  {facets.muscles.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SystemSelect>
              </div>
              <div className="min-w-0 flex-1">
                <SystemSelect
                  aria-label={copy.equipment}
                  value={equipment ?? ''}
                  onChange={(event) => {
                    setEquipment(event.target.value === '' ? null : event.target.value);
                  }}
                >
                  <option value="">
                    {copy.equipment}: {copy.any}
                  </option>
                  {facets.equipment.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SystemSelect>
              </div>
            </div>
          </div>

          <div className="mt-3">
            {exercises.isPending ? (
              <SystemLoading />
            ) : exercises.isError ? (
              <SystemErrorPanel
                message={systemMessage(exercises.error, systemCopy.errors.load)}
                onRetry={() => {
                  void exercises.refetch();
                }}
              />
            ) : hits.length === 0 ? (
              <p className="py-4 text-center text-sm text-steel">{copy.noMatches}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-system/10">
                {hits.slice(0, SHOWN).map(({ exercise, summary }) => (
                  <li key={exercise.id}>
                    <button
                      type="button"
                      className="flex min-h-12 w-full items-center gap-2 py-2 text-left active:bg-system/10"
                      onClick={() => {
                        onPick({ id: exercise.id, name: exercise.name, kind: exercise.kind });
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-hunter">{exercise.name}</span>
                        <span className="block truncate text-xs text-steel">
                          {[
                            exercise.user_id !== null ? copy.custom : null,
                            copy.kinds[exercise.kind],
                            exercise.equipment,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {summary !== null && (
                        <span
                          className="shrink-0 font-display text-xs text-system-glow"
                          data-readout
                        >
                          {copy.sets(summary.set_count)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hits.length > SHOWN && (
              <p className="pt-2 text-center text-xs text-steel">
                {copy.moreResults(hits.length - SHOWN)}
              </p>
            )}
          </div>
        </SystemWindow>

        {allowCreate && libraryOnly !== true && (
          <CreateCustomExercise
            initialName={query}
            kinds={kinds ?? EXERCISE_KINDS}
            onCreated={onPick}
          />
        )}
      </div>
    </div>
  );
}

function CreateCustomExercise({
  initialName,
  kinds,
  onCreated,
}: {
  initialName: string;
  kinds: readonly ExerciseKind[];
  onCreated: (exercise: Exercise | PickedExercise) => void;
}) {
  const create = useCreateExercise();
  const [name, setName] = useState<string | null>(null);
  const [kind, setKind] = useState<ExerciseKind>(kinds[0] ?? 'strength');
  const [error, setError] = useState<string | null>(null);
  const shownName = name ?? initialName;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (shownName.trim() === '' || shownName.trim().length > 60) {
      setError(systemCopy.errors.generic);
      return;
    }
    create.mutate(
      { name: shownName, kind },
      {
        onSuccess: (created) => {
          onCreated(created);
        },
        onError: (mutationError) => {
          setError(systemMessage(mutationError));
        },
      },
    );
  }

  return (
    <SystemWindow title={copy.createCustom} animate={false}>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <SystemField
          label={copy.customName}
          htmlFor="custom-exercise-name"
          error={error ?? undefined}
        >
          <SystemInput
            id="custom-exercise-name"
            value={shownName}
            maxLength={60}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </SystemField>
        <SystemField label={copy.customKind} htmlFor="custom-exercise-kind">
          <SystemSelect
            id="custom-exercise-kind"
            value={kind}
            onChange={(event) => {
              const next = kinds.find((candidate) => candidate === event.target.value);
              if (next !== undefined) setKind(next);
            }}
          >
            {kinds.map((option) => (
              <option key={option} value={option}>
                {copy.kinds[option]}
              </option>
            ))}
          </SystemSelect>
        </SystemField>
        <SystemButton type="submit" tone="ghost" disabled={create.isPending}>
          {copy.create}
        </SystemButton>
      </form>
    </SystemWindow>
  );
}
