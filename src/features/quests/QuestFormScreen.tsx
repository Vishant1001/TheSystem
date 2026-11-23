import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { SystemButton } from '../../components/SystemButton';
import { SystemField, SystemInput, SystemSelect } from '../../components/SystemField';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { SystemWindow } from '../../components/SystemWindow';
import { useToast } from '../../components/toastContext';
import { systemCopy } from '../../copy/system';
import { DIFFICULTIES, STAT_IDS, questXp, type Difficulty, type StatId } from '../../game';
import { useArchiveQuest, useCreateQuest, useUpdateQuest } from '../../lib/mutations/quests';
import { useQuests } from '../../lib/queries/quests';
import { questInputSchema, type QuestInput } from '../../lib/schemas';
import { systemMessage } from '../../lib/systemError';
import { useAuth } from '../auth/authContext';

type FieldErrors = Partial<Record<keyof QuestInput, string>>;

const WEEKDAYS: { iso: number; label: string }[] = [
  { iso: 1, label: 'Mo' },
  { iso: 2, label: 'Tu' },
  { iso: 3, label: 'We' },
  { iso: 4, label: 'Th' },
  { iso: 5, label: 'Fr' },
  { iso: 6, label: 'Sa' },
  { iso: 7, label: 'Su' },
];

const chipClass = (active: boolean) =>
  `font-display min-h-9 border px-2 text-xs font-semibold tracking-wider uppercase transition-colors ${
    active
      ? 'border-system/70 bg-system/20 text-system-glow'
      : 'border-steel/30 text-steel hover:border-steel/60 hover:text-hunter'
  }`;

interface QuestFormScreenProps {
  mode: 'create' | 'edit';
}

export function QuestFormScreen({ mode }: QuestFormScreenProps) {
  const { questId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { session } = useAuth();
  const quests = useQuests();

  const existing = mode === 'edit' ? quests.data?.find((quest) => quest.id === questId) : undefined;

  const [title, setTitle] = useState('');
  const [type, setType] = useState<'daily' | 'one_time'>('daily');
  const [category, setCategory] = useState<'fitness' | 'diet' | 'life'>('life');
  const [goalType, setGoalType] = useState<'boolean' | 'count' | 'duration' | 'numeric'>('boolean');
  const [targetValue, setTargetValue] = useState('');
  const [unit, setUnit] = useState('');
  const [statTags, setStatTags] = useState<StatId[]>(['INT']);
  const [difficulty, setDifficulty] = useState<Difficulty>('C');
  const [isCore, setIsCore] = useState(false);
  const [scheduleDays, setScheduleDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [dueOn, setDueOn] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(mode === 'create');
  const [confirmArchive, setConfirmArchive] = useState(false);

  const create = useCreateQuest();
  const update = useUpdateQuest();
  const archive = useArchiveQuest();
  const pending = create.isPending || update.isPending || archive.isPending;

  // Fill the form once the quest arrives from the cache.
  if (mode === 'edit' && !hydrated && existing !== undefined) {
    setTitle(existing.title);
    setType(existing.type === 'one_time' ? 'one_time' : 'daily');
    setCategory(existing.category as 'fitness' | 'diet' | 'life');
    setGoalType(existing.goal_type as 'boolean' | 'count' | 'duration' | 'numeric');
    setTargetValue(existing.target_value === null ? '' : String(existing.target_value));
    setUnit(existing.unit ?? '');
    setStatTags(existing.stat_tags as StatId[]);
    setDifficulty(existing.difficulty as Difficulty);
    setIsCore(existing.is_core);
    setScheduleDays(existing.schedule_days ?? [1, 2, 3, 4, 5, 6, 7]);
    setDueOn(existing.due_on ?? '');
    setHydrated(true);
  }

  if (mode === 'edit' && quests.isPending) return <SystemLoading />;
  if (mode === 'edit' && existing === undefined) {
    return (
      <SystemErrorPanel
        message={systemCopy.quests.notFound}
        onRetry={() => {
          void navigate('/quests');
        }}
      />
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = questInputSchema.safeParse({
      title,
      type,
      category,
      goalType,
      targetValue: goalType === 'boolean' || targetValue === '' ? null : Number(targetValue),
      unit: unit.trim() === '' ? null : unit.trim(),
      statTags,
      difficulty,
      isCore,
      scheduleDays: type === 'daily' ? scheduleDays : null,
      dueOn: type === 'one_time' && dueOn !== '' ? dueOn : null,
    });

    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        title: flattened.title?.[0],
        targetValue: flattened.targetValue?.[0],
        unit: flattened.unit?.[0],
        statTags: flattened.statTags?.[0],
        scheduleDays: flattened.scheduleDays?.[0],
        dueOn: flattened.dueOn?.[0],
      });
      return;
    }
    setFieldErrors({});

    const input = parsed.data;
    const shared = {
      title: input.title,
      category: input.category,
      goal_type: input.goalType,
      target_value: input.targetValue,
      unit: input.unit,
      stat_tags: input.statTags,
      difficulty: input.difficulty,
      is_core: input.isCore,
      schedule_days: input.scheduleDays,
      due_on: input.dueOn,
    };

    const onError = (mutationError: unknown) => {
      setFormError(systemMessage(mutationError));
    };

    if (mode === 'create') {
      const userId = session?.user.id;
      if (userId === undefined) {
        setFormError(systemCopy.errorsByToken.AUTH_REQUIRED ?? systemCopy.errors.generic);
        return;
      }
      create.mutate(
        { ...shared, user_id: userId, type: input.type, tracking: 'manual' },
        {
          onSuccess: () => {
            void navigate('/quests');
          },
          onError,
        },
      );
    } else if (questId !== undefined) {
      // type and tracking are immutable on the server, so they are not patched.
      update.mutate(
        { id: questId, patch: shared },
        {
          onSuccess: () => {
            void navigate('/quests');
          },
          onError,
        },
      );
    }
  }

  function toggleStat(stat: StatId) {
    setStatTags((current) => {
      if (current.includes(stat)) return current.filter((entry) => entry !== stat);
      if (current.length >= 2) return [current[1] as StatId, stat];
      return [...current, stat];
    });
  }

  function toggleDay(iso: number) {
    setScheduleDays((current) =>
      current.includes(iso)
        ? current.filter((entry) => entry !== iso)
        : [...current, iso].sort((a, b) => a - b),
    );
  }

  return (
    <SystemWindow
      title={systemCopy.windows.questDesigner}
      headerAside={mode === 'edit' ? 'EDIT' : 'NEW'}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <SystemField label={systemCopy.questForm.title} htmlFor="title" error={fieldErrors.title}>
          <SystemInput
            id="title"
            value={title}
            maxLength={80}
            placeholder={systemCopy.questForm.titlePlaceholder}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
            disabled={pending}
          />
        </SystemField>

        <SystemField
          label={systemCopy.questForm.type}
          htmlFor="type"
          hint={mode === 'edit' ? systemCopy.questForm.typeLocked : systemCopy.questForm.manualOnly}
        >
          <div className="flex gap-2">
            <button
              type="button"
              id="type"
              className={chipClass(type === 'daily')}
              onClick={() => {
                setType('daily');
              }}
              disabled={pending || mode === 'edit'}
            >
              {systemCopy.questForm.typeDaily}
            </button>
            <button
              type="button"
              className={chipClass(type === 'one_time')}
              onClick={() => {
                setType('one_time');
              }}
              disabled={pending || mode === 'edit'}
            >
              {systemCopy.questForm.typeOneTime}
            </button>
          </div>
        </SystemField>

        <SystemField label={systemCopy.questForm.category} htmlFor="category">
          <SystemSelect
            id="category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as 'fitness' | 'diet' | 'life');
            }}
            disabled={pending}
          >
            <option value="fitness">{systemCopy.questForm.categoryFitness}</option>
            <option value="diet">{systemCopy.questForm.categoryDiet}</option>
            <option value="life">{systemCopy.questForm.categoryLife}</option>
          </SystemSelect>
        </SystemField>

        <SystemField label={systemCopy.questForm.goalType} htmlFor="goal-type">
          <SystemSelect
            id="goal-type"
            value={goalType}
            onChange={(event) => {
              setGoalType(event.target.value as 'boolean' | 'count' | 'duration' | 'numeric');
            }}
            disabled={pending}
          >
            <option value="boolean">{systemCopy.questForm.goalBoolean}</option>
            <option value="count">{systemCopy.questForm.goalCount}</option>
            <option value="duration">{systemCopy.questForm.goalDuration}</option>
            <option value="numeric">{systemCopy.questForm.goalNumeric}</option>
          </SystemSelect>
        </SystemField>

        {goalType !== 'boolean' && (
          <SystemField
            label={systemCopy.questForm.targetValue}
            htmlFor="target"
            error={fieldErrors.targetValue ?? fieldErrors.unit}
          >
            <div className="flex items-center gap-2">
              <SystemInput
                id="target"
                type="number"
                inputMode="numeric"
                value={targetValue}
                onChange={(event) => {
                  setTargetValue(event.target.value);
                }}
                disabled={pending}
              />
              <SystemInput
                aria-label={systemCopy.questForm.unit}
                placeholder={systemCopy.questForm.unitPlaceholder}
                value={unit}
                maxLength={12}
                onChange={(event) => {
                  setUnit(event.target.value);
                }}
                disabled={pending}
              />
            </div>
          </SystemField>
        )}

        <SystemField
          label={systemCopy.questForm.statTags}
          htmlFor="stats"
          hint={systemCopy.questForm.statTagsHint}
          error={fieldErrors.statTags}
        >
          <div className="flex flex-wrap gap-2" id="stats">
            {STAT_IDS.map((stat) => (
              <button
                key={stat}
                type="button"
                className={chipClass(statTags.includes(stat))}
                aria-pressed={statTags.includes(stat)}
                onClick={() => {
                  toggleStat(stat);
                }}
                disabled={pending}
              >
                {stat}
              </button>
            ))}
          </div>
        </SystemField>

        <SystemField
          label={systemCopy.questForm.difficulty}
          htmlFor="difficulty"
          hint={`${systemCopy.questForm.difficultyHint} ${difficulty} = ${String(questXp(difficulty))} XP`}
        >
          <div className="flex flex-wrap gap-2" id="difficulty">
            {DIFFICULTIES.map((level) => (
              <button
                key={level}
                type="button"
                className={chipClass(difficulty === level)}
                aria-pressed={difficulty === level}
                onClick={() => {
                  setDifficulty(level);
                }}
                disabled={pending}
              >
                {level}
              </button>
            ))}
          </div>
        </SystemField>

        {type === 'daily' ? (
          <SystemField
            label={systemCopy.questForm.scheduleDays}
            htmlFor="days"
            error={fieldErrors.scheduleDays}
          >
            <div className="flex flex-wrap gap-1.5" id="days">
              {WEEKDAYS.map((weekday) => (
                <button
                  key={weekday.iso}
                  type="button"
                  className={chipClass(scheduleDays.includes(weekday.iso))}
                  aria-pressed={scheduleDays.includes(weekday.iso)}
                  onClick={() => {
                    toggleDay(weekday.iso);
                  }}
                  disabled={pending}
                >
                  {weekday.label}
                </button>
              ))}
            </div>
          </SystemField>
        ) : (
          <SystemField
            label={systemCopy.questForm.dueOn}
            htmlFor="due-on"
            hint={systemCopy.questForm.dueOnHint}
            error={fieldErrors.dueOn}
          >
            <SystemInput
              id="due-on"
              type="date"
              value={dueOn}
              onChange={(event) => {
                setDueOn(event.target.value);
              }}
              disabled={pending}
            />
          </SystemField>
        )}

        <label className="flex items-center gap-2 text-sm text-hunter">
          <input
            type="checkbox"
            className="size-4 accent-[#2E8BFF]"
            checked={isCore}
            onChange={(event) => {
              setIsCore(event.target.checked);
            }}
            disabled={pending}
          />
          {systemCopy.questForm.core}
          <span className="text-xs text-steel">{systemCopy.questForm.coreHint}</span>
        </label>

        {formError !== null && (
          <p
            role="alert"
            className="border border-penalty/50 bg-penalty-bg/80 px-3 py-2 text-sm text-penalty-text"
          >
            {formError}
          </p>
        )}

        <SystemButton type="submit" disabled={pending} className="w-full">
          {pending
            ? systemCopy.quests.working
            : mode === 'create'
              ? systemCopy.quests.create
              : systemCopy.quests.save}
        </SystemButton>

        <div className="flex items-center justify-between gap-2">
          <SystemButton
            tone="ghost"
            className="min-h-9 px-3 text-xs"
            onClick={() => {
              void navigate('/quests');
            }}
            disabled={pending}
          >
            Back
          </SystemButton>

          {mode === 'edit' && questId !== undefined && (
            <SystemButton
              tone="penalty"
              className="min-h-9 px-3 text-xs"
              disabled={pending}
              onClick={() => {
                if (!confirmArchive) {
                  setConfirmArchive(true);
                  return;
                }
                archive.mutate(questId, {
                  onSuccess: () => {
                    toast.show({
                      title: systemCopy.quests.archived,
                      lines: [],
                    });
                    void navigate('/quests');
                  },
                  onError: (mutationError) => {
                    setFormError(systemMessage(mutationError));
                  },
                });
              }}
            >
              {confirmArchive ? systemCopy.quests.archiveConfirm : systemCopy.quests.archive}
            </SystemButton>
          )}
        </div>
      </form>
    </SystemWindow>
  );
}
