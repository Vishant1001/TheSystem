import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SystemButton } from '../../components/SystemButton';
import { SystemField, SystemSelect } from '../../components/SystemField';
import { SystemLink } from '../../components/SystemLink';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { SystemWindow } from '../../components/SystemWindow';
import { useToast } from '../../components/toastContext';
import { systemCopy } from '../../copy/system';
import {
  GAME_CONFIG,
  PENALTY_MODES,
  isValidRestDays,
  type PenaltyMode,
  type SafeKind,
} from '../../game';
import {
  useEndSafePeriod,
  useStartSafePeriod,
  useUpdateRules,
} from '../../lib/mutations/safeZones';
import { useHunterSnapshot } from '../../lib/queries/hunterSnapshot';
import type { HunterSnapshot, SafePeriod } from '../../lib/schemas';
import { systemMessage } from '../../lib/systemError';

const copy = systemCopy.safeZones;
const { maxRestDays, quotaDays, quotaWindowDays } = GAME_CONFIG.safeZones;

const chipClass = (active: boolean) =>
  `font-display min-h-11 min-w-11 border px-2 text-xs font-semibold tracking-wider uppercase transition-colors ${
    active
      ? 'border-system/70 bg-system/20 text-system-glow'
      : 'border-steel/30 text-steel hover:border-steel/60 hover:text-hunter'
  }`;

function restDaysLabel(days: number[]): string {
  if (days.length === 0) return copy.noRestDays;
  return days.map((day) => copy.weekdays[day - 1] ?? String(day)).join(', ');
}

/**
 * Safe Zones (brief 3.1, 3.7, 3.8). Penalty mode and rest days are versioned
 * server-side and apply from tomorrow; Sick/Travel opens immediately (or
 * tomorrow, after today's warning time) within the rolling quota.
 */
export function SafeZonesScreen() {
  const { data, isPending, isError, error, refetch } = useHunterSnapshot();

  if (isPending) return <SystemLoading />;
  if (isError) {
    return (
      <SystemErrorPanel
        message={systemMessage(error, systemCopy.errors.load)}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }
  if (data === null) return <SystemLoading />;

  return (
    <>
      {/* Remounts (and so re-seeds) when the stored rules change. */}
      <RulesWindow
        key={`${data.safe_zones.rules_tomorrow.penalty_mode}|${data.safe_zones.rules_tomorrow.rest_days.join(',')}`}
        snapshot={data}
      />
      <SafePeriodWindow snapshot={data} />
      <SystemLink to="/settings" tone="ghost" className="w-full">
        {copy.back}
      </SystemLink>
    </>
  );
}

function RulesWindow({ snapshot }: { snapshot: HunterSnapshot }) {
  const { rules_today: today, rules_tomorrow: tomorrow } = snapshot.safe_zones;
  const [mode, setMode] = useState<PenaltyMode>(tomorrow.penalty_mode);
  const [restDays, setRestDays] = useState<number[]>(tomorrow.rest_days);
  const update = useUpdateRules();
  // A toast, not local state: a successful save re-keys (remounts) this form.
  const toast = useToast();

  function toggleDay(day: number) {
    setRestDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  const valid = isValidRestDays(restDays);
  const changed =
    mode !== tomorrow.penalty_mode || restDays.join(',') !== tomorrow.rest_days.join(',');

  return (
    <SystemWindow title={systemCopy.windows.safeZones}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-steel">{copy.prompt}</p>

        <div className="flex flex-col gap-1 border border-system/20 bg-system/5 px-3 py-2 text-xs">
          <p className="flex justify-between gap-2">
            <span className="text-steel">{copy.inForceToday}</span>
            <span className="text-hunter" data-readout>
              {copy.modes[today.penalty_mode].name} · {restDaysLabel(today.rest_days)}
            </span>
          </p>
          <p className="flex justify-between gap-2">
            <span className="text-steel">{copy.tomorrow}</span>
            <span className="text-hunter" data-readout>
              {copy.modes[tomorrow.penalty_mode].name} · {restDaysLabel(tomorrow.rest_days)}
            </span>
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1 font-display text-xs font-semibold tracking-[0.18em] text-steel uppercase">
            {copy.modeTitle}
          </legend>
          {PENALTY_MODES.map((option) => (
            <label
              key={option}
              className={`flex cursor-pointer items-start gap-3 border px-3 py-2 ${
                mode === option ? 'border-system/70 bg-system/15' : 'border-steel/30'
              }`}
            >
              <input
                type="radio"
                name="penalty-mode"
                className="mt-1 size-4 accent-[#2E8BFF]"
                checked={mode === option}
                onChange={() => {
                  setMode(option);
                }}
                aria-label={copy.modes[option].name}
                disabled={update.isPending}
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-display text-sm font-semibold tracking-wider text-hunter uppercase">
                  {copy.modes[option].name}
                </span>
                <span className="text-xs text-steel">{copy.modes[option].description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <SystemField
          label={copy.restTitle}
          htmlFor="rest-days"
          hint={copy.restHint(maxRestDays)}
          error={valid ? undefined : copy.tooManyRestDays(maxRestDays)}
        >
          <div className="flex flex-wrap gap-1.5" id="rest-days">
            {copy.weekdays.map((label, index) => {
              const day = index + 1;
              return (
                <button
                  key={label}
                  type="button"
                  className={chipClass(restDays.includes(day))}
                  aria-pressed={restDays.includes(day)}
                  disabled={update.isPending}
                  onClick={() => {
                    toggleDay(day);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </SystemField>

        <p className="text-xs text-steel/80">{copy.fromTomorrow}</p>

        <SystemButton
          className="w-full"
          disabled={!valid || !changed || update.isPending}
          onClick={() => {
            update.mutate(
              { mode, restDays },
              {
                onSuccess: () => {
                  toast.show({ title: copy.rulesSaved, lines: [] });
                },
                onError: (mutationError) => {
                  toast.show({
                    title: systemCopy.errors.generic,
                    lines: [systemMessage(mutationError)],
                    tone: 'penalty',
                  });
                },
              },
            );
          }}
        >
          {update.isPending ? copy.savingRules : copy.saveRules}
        </SystemButton>
      </div>
    </SystemWindow>
  );
}

function SafePeriodWindow({ snapshot }: { snapshot: HunterSnapshot }) {
  const zones = snapshot.safe_zones;
  const bookable = zones.safe_days_bookable;
  const [kind, setKind] = useState<SafeKind>('sick');
  const [days, setDays] = useState(1);
  const [ending, setEnding] = useState<SafePeriod | null>(null);
  const start = useStartSafePeriod();
  const end = useEndSafePeriod();
  const toast = useToast();

  // The chosen length never exceeds what the quota allows right now.
  const chosenDays = Math.max(1, Math.min(days, bookable));

  const showError = (mutationError: unknown) => {
    toast.show({
      title: systemCopy.errors.generic,
      lines: [systemMessage(mutationError)],
      tone: 'penalty',
    });
  };

  return (
    <SystemWindow title={copy.safeTitle}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-steel">{copy.safeHint}</p>
        <p className="text-xs text-steel/80">{copy.quotaRule(quotaDays, quotaWindowDays)}</p>

        {zones.safe_periods.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="font-display text-xs font-semibold tracking-[0.18em] text-steel uppercase">
              {copy.periods}
            </p>
            <ul className="flex flex-col divide-y divide-system/10">
              {zones.safe_periods.map((period) => (
                <li key={period.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex flex-col">
                    <span className="font-display text-sm tracking-wide text-hunter uppercase">
                      {period.kind === 'sick' ? copy.kindSick : copy.kindTravel}
                    </span>
                    <span className="font-display text-xs text-steel" data-readout>
                      {copy.periodRange(period.start_on, period.last_safe_on)}
                    </span>
                  </span>
                  {/* Ending early applies from tomorrow, so only offer it while
                      a safe day after today remains. */}
                  {period.last_safe_on > snapshot.game_today && (
                    <SystemButton
                      tone="ghost"
                      className="min-h-9 px-3 text-xs"
                      disabled={end.isPending}
                      onClick={() => {
                        setEnding(period);
                      }}
                    >
                      {copy.endEarly}
                    </SystemButton>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {bookable === 0 ? (
          <p className="text-sm text-steel">
            {zones.safe_periods.some(
              (period) =>
                period.start_on <= zones.safe_start_on &&
                period.last_safe_on >= zones.safe_start_on,
            )
              ? copy.alreadyCovered(zones.safe_start_on)
              : copy.quotaEmpty}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <SystemField label={copy.kind} htmlFor="safe-kind">
                <SystemSelect
                  id="safe-kind"
                  value={kind}
                  disabled={start.isPending}
                  onChange={(event) => {
                    setKind(event.target.value === 'travel' ? 'travel' : 'sick');
                  }}
                >
                  <option value="sick">{copy.kindSick}</option>
                  <option value="travel">{copy.kindTravel}</option>
                </SystemSelect>
              </SystemField>
              <SystemField label={copy.days} htmlFor="safe-days">
                <SystemSelect
                  id="safe-days"
                  value={chosenDays}
                  disabled={start.isPending}
                  onChange={(event) => {
                    setDays(Number(event.target.value));
                  }}
                >
                  {Array.from({ length: bookable }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </SystemSelect>
              </SystemField>
            </div>
            <p className="font-display text-xs text-steel" data-readout>
              {copy.startsOn(zones.safe_start_on)} · {copy.quotaLeft(bookable)}
            </p>
            <SystemButton
              className="w-full"
              disabled={start.isPending}
              onClick={() => {
                start.mutate(
                  { kind, days: chosenDays },
                  {
                    onSuccess: () => {
                      toast.show({ title: copy.activated, lines: [] });
                    },
                    onError: showError,
                  },
                );
              }}
            >
              {start.isPending ? copy.activating : copy.activate}
            </SystemButton>
          </>
        )}
      </div>

      <ConfirmDialog
        open={ending !== null}
        title={copy.endEarlyTitle}
        detail={
          ending === null ? undefined : copy.periodRange(ending.start_on, ending.last_safe_on)
        }
        body={copy.endEarlyBody}
        confirmLabel={copy.endEarlyConfirm}
        cancelLabel={copy.endEarlyCancel}
        pending={end.isPending}
        onCancel={() => {
          setEnding(null);
        }}
        onConfirm={() => {
          if (ending === null) return;
          end.mutate(ending.id, {
            onSuccess: () => {
              toast.show({ title: copy.ended, lines: [] });
            },
            onError: showError,
            onSettled: () => {
              setEnding(null);
            },
          });
        }}
      />
    </SystemWindow>
  );
}
