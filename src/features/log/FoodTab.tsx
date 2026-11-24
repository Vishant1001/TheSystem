import { useState, type FormEvent } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { SystemButton } from '../../components/SystemButton';
import { SystemField, SystemInput } from '../../components/SystemField';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { XpBar } from '../../components/XpBar';
import { useToast } from '../../components/toastContext';
import { systemCopy } from '../../copy/system';
import {
  awardFromOutcome,
  trialAwardFrom,
  useDeleteFood,
  useLogFood,
  type AutoOutcome,
} from '../../lib/mutations/logs';
import { awardedStats, modifierLines } from '../../lib/mutations/quests';
import { kcalStatus, sumFood, useFood } from '../../lib/queries/logs';
import type { HunterSnapshot } from '../../lib/schemas';
import { systemMessage } from '../../lib/systemError';

const statusCopy = {
  empty: systemCopy.log.kcalEmpty,
  below: systemCopy.log.kcalBelow,
  in_range: systemCopy.log.kcalInRange,
  over: systemCopy.log.kcalOver,
} as const;

const statusTone = {
  empty: 'text-steel',
  below: 'text-steel',
  in_range: 'text-system-glow',
  over: 'text-penalty-text',
} as const;

export function FoodTab({ snapshot }: { snapshot: HunterSnapshot }) {
  const day = snapshot.game_today;
  const targets = snapshot.effective_targets_today;
  const toast = useToast();

  const food = useFood(day);
  const logFood = useLogFood(day);
  const deleteFood = useDeleteFood(day);

  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const totals = sumFood(food.data);
  const status = kcalStatus(totals.kcal, targets.kcal_min, targets.kcal_max);
  const proteinMet = totals.proteinG >= targets.protein_target_g;
  const busy = logFood.isPending || deleteFood.isPending;

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

    const kcalValue = Number(kcal);
    const proteinValue = Number(protein === '' ? '0' : protein);
    if (name.trim() === '' || Number.isNaN(kcalValue) || kcal === '') {
      setFormError(systemCopy.errors.generic);
      return;
    }

    logFood.mutate(
      { name: name.trim(), kcal: kcalValue, proteinG: proteinValue },
      {
        onSuccess: (result) => {
          setName('');
          setKcal('');
          setProtein('');
          reportAuto(result.auto_protein);
          const trial = trialAwardFrom(result.trial);
          if (trial !== null) {
            const stats = awardedStats(trial)
              .map((entry) => `${entry.id} +${entry.amount}`)
              .join(' · ');
            toast.show({
              title: systemCopy.penalty.trialToast,
              lines: [`+${trial.xp} XP${stats === '' ? '' : ` · ${stats}`}`],
            });
          }
        },
        onError: (error) => {
          setFormError(systemMessage(error));
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {food.isError ? (
        <SystemErrorPanel
          message={systemMessage(food.error, systemCopy.errors.load)}
          onRetry={() => {
            void food.refetch();
          }}
        />
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-xs tracking-wide text-steel">{systemCopy.log.kcalLabel}</span>
              <span className="font-display text-sm text-hunter" data-readout>
                {totals.kcal} / {targets.kcal_min}–{targets.kcal_max}
              </span>
            </div>
            <XpBar value={totals.kcal} max={targets.kcal_max} />
            <span className={`font-display text-[0.6875rem] tracking-wider ${statusTone[status]}`}>
              {statusCopy[status]}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-xs tracking-wide text-steel">
                {systemCopy.log.proteinLabel}
              </span>
              <span className="font-display text-sm text-hunter" data-readout>
                {totals.proteinG} / {targets.protein_target_g} g
              </span>
            </div>
            <XpBar value={totals.proteinG} max={targets.protein_target_g} />
            {proteinMet && (
              <span className="font-display text-[0.6875rem] tracking-wider text-system-glow">
                {systemCopy.log.proteinMet}
              </span>
            )}
          </div>
        </section>
      )}

      {food.isError ? null : food.isPending ? (
        <SystemLoading />
      ) : food.data === undefined || food.data.length === 0 ? (
        <EmptyState message={systemCopy.empty.food} />
      ) : (
        <ul className="flex flex-col divide-y divide-system/10">
          {food.data.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2 py-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-hunter">{entry.name}</span>
                <span className="font-display text-[0.6875rem] text-steel" data-readout>
                  {entry.kcal} kcal · {entry.protein_g} g
                </span>
              </div>
              <SystemButton
                tone="ghost"
                className="min-h-9 shrink-0 px-2 text-[0.625rem]"
                disabled={busy}
                onClick={() => {
                  deleteFood.mutate(entry.id, {
                    onSuccess: (result) => {
                      reportAuto(result.auto_protein);
                    },
                    onError: (error) => {
                      setFormError(systemMessage(error));
                    },
                  });
                }}
              >
                {systemCopy.log.deleteEntry}
              </SystemButton>
            </li>
          ))}
        </ul>
      )}

      <form className="flex flex-col gap-3 border-t border-system/15 pt-4" onSubmit={handleSubmit}>
        <SystemField label={systemCopy.log.foodName} htmlFor="food-name">
          <SystemInput
            id="food-name"
            value={name}
            maxLength={80}
            placeholder={systemCopy.log.foodNamePlaceholder}
            onChange={(event) => {
              setName(event.target.value);
            }}
            disabled={busy}
          />
        </SystemField>

        <div className="flex gap-2">
          <SystemField label={systemCopy.log.foodKcal} htmlFor="food-kcal">
            <SystemInput
              id="food-kcal"
              type="number"
              inputMode="numeric"
              value={kcal}
              onChange={(event) => {
                setKcal(event.target.value);
              }}
              disabled={busy}
            />
          </SystemField>
          <SystemField label={systemCopy.log.foodProtein} htmlFor="food-protein">
            <SystemInput
              id="food-protein"
              type="number"
              inputMode="numeric"
              value={protein}
              onChange={(event) => {
                setProtein(event.target.value);
              }}
              disabled={busy}
            />
          </SystemField>
        </div>

        {formError !== null && (
          <p
            role="alert"
            className="border border-penalty/50 bg-penalty-bg/80 px-3 py-2 text-sm text-penalty-text"
          >
            {formError}
          </p>
        )}

        <SystemButton type="submit" disabled={busy} className="w-full">
          {logFood.isPending ? systemCopy.log.working : systemCopy.log.addFood}
        </SystemButton>
      </form>
    </div>
  );
}
