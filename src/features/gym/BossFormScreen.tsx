import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { SystemButton } from '../../components/SystemButton';
import { SystemField, SystemInput } from '../../components/SystemField';
import { SystemLink } from '../../components/SystemLink';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { SystemWindow } from '../../components/SystemWindow';
import { useToast } from '../../components/toastContext';
import { systemCopy } from '../../copy/system';
import { bossReward, DIFFICULTIES, GAME_CONFIG, type Difficulty } from '../../game';
import {
  useArchiveBoss,
  useCreateBoss,
  useUpdateBoss,
  type BossInput,
} from '../../lib/mutations/gym';
import { useBosses, type BossRow } from '../../lib/queries/gym';
import { systemMessage } from '../../lib/systemError';
import { ExercisePicker, type PickedExercise } from './ExercisePicker';
import { formatKg } from './gymText';

const copy = systemCopy.gym;

/** Boss create and edit (brief 4.5). A defeated boss is a trophy: read-only. */
export function BossFormScreen({ mode }: { mode: 'create' | 'edit' }) {
  const { bossId } = useParams();
  const bosses = useBosses();

  if (mode === 'create') return <BossForm existing={null} />;
  if (bosses.isPending) return <SystemLoading />;
  if (bosses.isError) {
    return (
      <SystemErrorPanel
        message={systemMessage(bosses.error, systemCopy.errors.load)}
        onRetry={() => {
          void bosses.refetch();
        }}
      />
    );
  }
  const boss = bosses.data.find((candidate) => candidate.id === bossId);
  if (boss === undefined || boss.defeated_on !== null) {
    return (
      <SystemWindow title={systemCopy.windows.bossDesigner}>
        <EmptyState
          message={boss === undefined ? copy.bossNotFound : copy.bossDefeatedLocked}
          action={
            <SystemLink to="/quests" tone="ghost">
              {systemCopy.quests.back}
            </SystemLink>
          }
        />
      </SystemWindow>
    );
  }
  return <BossForm existing={boss} />;
}

function parseWeight(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0 || value > 1000) return null;
  return Math.abs(Math.round(value * 100) - value * 100) < 1e-6 ? value : null;
}

function BossForm({ existing }: { existing: BossRow | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateBoss();
  const update = useUpdateBoss();
  const archive = useArchiveBoss();

  const [exercise, setExercise] = useState<PickedExercise | null>(
    existing === null || existing.exercises === null
      ? null
      : { id: existing.exercise_id, name: existing.exercises.name, kind: 'strength' },
  );
  const [weight, setWeight] = useState(
    existing === null ? '' : formatKg(existing.target_weight_kg),
  );
  const [reps, setReps] = useState(
    String(existing?.target_reps ?? GAME_CONFIG.gym.boss.defaultTargetReps),
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(
    DIFFICULTIES.find((d) => d === existing?.difficulty) ?? 'C',
  );
  const [name, setName] = useState(existing?.name ?? '');
  const [picking, setPicking] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending || archive.isPending;
  const reward = bossReward(difficulty);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const targetWeightKg = parseWeight(weight);
    const targetReps = Number(reps);
    if (
      exercise === null ||
      targetWeightKg === null ||
      !Number.isInteger(targetReps) ||
      targetReps < 1 ||
      targetReps > 1000
    ) {
      setError(systemCopy.errorsByToken.INVALID_BOSS ?? systemCopy.errors.generic);
      return;
    }
    const input: BossInput = {
      targetWeightKg,
      targetReps,
      difficulty,
      name: name.trim() === '' ? null : name.trim(),
    };
    const done = {
      onSuccess: () => {
        toast.show({
          title: copy.bosses,
          lines: [existing === null ? copy.bossCreated : copy.bossSaved],
        });
        void navigate('/quests');
      },
      onError: (mutationError: unknown) => {
        setError(systemMessage(mutationError));
      },
    };
    if (existing === null) create.mutate({ ...input, exerciseId: exercise.id }, done);
    else update.mutate({ ...input, bossId: existing.id }, done);
  }

  return (
    <>
      <SystemWindow
        title={systemCopy.windows.bossDesigner}
        headerAside={existing === null ? systemCopy.quests.modeNew : systemCopy.quests.modeEdit}
      >
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <SystemField
            label={copy.bossExercise}
            htmlFor="boss-exercise"
            hint={existing === null ? undefined : copy.bossExerciseLocked}
          >
            <SystemButton
              id="boss-exercise"
              tone="ghost"
              className="w-full justify-start tracking-normal normal-case"
              disabled={existing !== null || pending}
              onClick={() => {
                setPicking(true);
              }}
            >
              {exercise?.name ?? copy.chooseExercise}
            </SystemButton>
          </SystemField>

          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <SystemField label={copy.bossWeight} htmlFor="boss-weight">
                <SystemInput
                  id="boss-weight"
                  inputMode="decimal"
                  value={weight}
                  onChange={(event) => {
                    setWeight(event.target.value);
                  }}
                />
              </SystemField>
            </div>
            <div className="w-28 shrink-0">
              <SystemField label={copy.bossReps} htmlFor="boss-reps">
                <SystemInput
                  id="boss-reps"
                  inputMode="numeric"
                  value={reps}
                  onChange={(event) => {
                    setReps(event.target.value);
                  }}
                />
              </SystemField>
            </div>
          </div>

          <SystemField
            label={copy.bossDifficulty}
            htmlFor="boss-difficulty"
            hint={copy.reward(reward.xp, reward.freePoints)}
          >
            <div className="flex gap-1.5" id="boss-difficulty" role="radiogroup">
              {DIFFICULTIES.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={option === difficulty}
                  className={`min-h-11 flex-1 border font-display text-sm font-bold ${
                    option === difficulty
                      ? 'border-monarch-text bg-monarch/20 text-monarch-text'
                      : 'border-steel/40 text-steel'
                  }`}
                  onClick={() => {
                    setDifficulty(option);
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </SystemField>

          <SystemField label={copy.bossName} htmlFor="boss-name">
            <SystemInput
              id="boss-name"
              value={name}
              maxLength={60}
              placeholder={copy.bossNamePlaceholder}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </SystemField>

          {error !== null && (
            <p
              role="alert"
              className="border border-penalty/50 bg-penalty-bg/80 px-3 py-2 text-sm text-penalty-text"
            >
              {error}
            </p>
          )}

          <SystemButton type="submit" disabled={pending} className="w-full">
            {pending ? copy.bossSaving : copy.bossSave}
          </SystemButton>
        </form>
      </SystemWindow>

      <div className="flex justify-center gap-3">
        <SystemButton
          tone="ghost"
          onClick={() => {
            void navigate('/quests');
          }}
        >
          {systemCopy.quests.back}
        </SystemButton>
        {existing !== null && (
          <SystemButton
            tone="penalty"
            disabled={pending}
            onClick={() => {
              setConfirmRetire(true);
            }}
          >
            {copy.retire}
          </SystemButton>
        )}
      </div>

      {picking && (
        <ExercisePicker
          title={copy.chooseExercise.toUpperCase()}
          kinds={GAME_CONFIG.gym.boss.kinds}
          onPick={(picked) => {
            setExercise(picked);
            setPicking(false);
          }}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmRetire}
        title={copy.retireTitle}
        body={copy.retireBody}
        confirmLabel={copy.retire}
        cancelLabel={copy.cancel}
        pending={archive.isPending}
        onConfirm={() => {
          if (existing === null) return;
          archive.mutate(existing.id, {
            onSuccess: () => {
              void navigate('/quests');
            },
            onError: (mutationError) => {
              setError(systemMessage(mutationError));
            },
            onSettled: () => {
              setConfirmRetire(false);
            },
          });
        }}
        onCancel={() => {
          setConfirmRetire(false);
        }}
      />
    </>
  );
}
