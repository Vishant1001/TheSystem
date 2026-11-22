import { useMemo, useState, type FormEvent } from 'react';
import { systemCopy } from '../copy/system';
import {
  ONBOARDING_DEFAULTS,
  hunterProfileInputSchema,
  type HunterProfileInput,
} from '../lib/schemas';
import { SystemButton } from './SystemButton';
import { SystemField, SystemInput, SystemSelect } from './SystemField';

type FieldErrors = Partial<Record<keyof HunterProfileInput, string>>;

export interface HunterProfileFormValues {
  hunterName: string;
  timezone: string;
  kcalMin: number;
  kcalMax: number;
  proteinTargetG: number;
}

interface HunterProfileFormProps {
  initialValues?: HunterProfileFormValues;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  formError?: string | null;
  footer?: React.ReactNode;
  onSubmit: (input: HunterProfileInput) => void;
}

function timezoneOptions(selected: string): string[] {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.includes(selected) ? zones : [selected, ...zones];
}

/**
 * Onboarding (5.7) and Hunter Settings (C4) collect exactly the same fields,
 * so they share one form and one zod schema rather than drifting apart.
 */
export function HunterProfileForm({
  initialValues,
  submitLabel,
  pendingLabel,
  pending,
  formError = null,
  footer,
  onSubmit,
}: HunterProfileFormProps) {
  const defaults: HunterProfileFormValues = initialValues ?? {
    hunterName: '',
    timezone: ONBOARDING_DEFAULTS.timezone,
    kcalMin: ONBOARDING_DEFAULTS.kcalMin,
    kcalMax: ONBOARDING_DEFAULTS.kcalMax,
    proteinTargetG: ONBOARDING_DEFAULTS.proteinTargetG,
  };

  const [hunterName, setHunterName] = useState(defaults.hunterName);
  const [timezone, setTimezone] = useState(defaults.timezone);
  const [kcalMin, setKcalMin] = useState(String(defaults.kcalMin));
  const [kcalMax, setKcalMax] = useState(String(defaults.kcalMax));
  const [proteinTargetG, setProteinTargetG] = useState(String(defaults.proteinTargetG));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const zones = useMemo(() => timezoneOptions(defaults.timezone), [defaults.timezone]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = hunterProfileInputSchema.safeParse({
      hunterName,
      timezone,
      kcalMin,
      kcalMax,
      proteinTargetG,
    });

    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        hunterName: flattened.hunterName?.[0],
        timezone: flattened.timezone?.[0],
        kcalMin: flattened.kcalMin?.[0],
        kcalMax: flattened.kcalMax?.[0],
        proteinTargetG: flattened.proteinTargetG?.[0],
      });
      return;
    }

    setFieldErrors({});
    onSubmit(parsed.data);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <SystemField
        label={systemCopy.onboarding.nameLabel}
        htmlFor="hunter-name"
        error={fieldErrors.hunterName}
      >
        <SystemInput
          id="hunter-name"
          value={hunterName}
          placeholder={systemCopy.onboarding.namePlaceholder}
          maxLength={40}
          autoComplete="nickname"
          onChange={(event) => {
            setHunterName(event.target.value);
          }}
          disabled={pending}
        />
      </SystemField>

      <SystemField
        label={systemCopy.onboarding.timezoneLabel}
        htmlFor="timezone"
        hint={systemCopy.onboarding.timezoneHint}
        error={fieldErrors.timezone}
      >
        <SystemSelect
          id="timezone"
          value={timezone}
          onChange={(event) => {
            setTimezone(event.target.value);
          }}
          disabled={pending}
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </SystemSelect>
      </SystemField>

      <SystemField
        label={systemCopy.onboarding.kcalLabel}
        htmlFor="kcal-min"
        error={fieldErrors.kcalMin ?? fieldErrors.kcalMax}
      >
        <div className="flex items-center gap-2">
          <SystemInput
            id="kcal-min"
            type="number"
            inputMode="numeric"
            aria-label={systemCopy.onboarding.kcalMin}
            value={kcalMin}
            onChange={(event) => {
              setKcalMin(event.target.value);
            }}
            disabled={pending}
          />
          <span className="text-steel">–</span>
          <SystemInput
            id="kcal-max"
            type="number"
            inputMode="numeric"
            aria-label={systemCopy.onboarding.kcalMax}
            value={kcalMax}
            onChange={(event) => {
              setKcalMax(event.target.value);
            }}
            disabled={pending}
          />
        </div>
      </SystemField>

      <SystemField
        label={systemCopy.onboarding.proteinLabel}
        htmlFor="protein"
        error={fieldErrors.proteinTargetG}
      >
        <div className="flex items-center gap-2">
          <SystemInput
            id="protein"
            type="number"
            inputMode="numeric"
            value={proteinTargetG}
            onChange={(event) => {
              setProteinTargetG(event.target.value);
            }}
            disabled={pending}
          />
          <span className="font-display text-sm text-steel">
            {systemCopy.onboarding.proteinUnit}
          </span>
        </div>
      </SystemField>

      {formError !== null && (
        <p
          role="alert"
          className="border border-penalty/50 bg-penalty-bg/80 px-3 py-2 text-sm text-penalty-text"
        >
          {formError}
        </p>
      )}

      <SystemButton type="submit" disabled={pending} className="w-full">
        {pending ? pendingLabel : submitLabel}
      </SystemButton>

      {footer}
    </form>
  );
}
