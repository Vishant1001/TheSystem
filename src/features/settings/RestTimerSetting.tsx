import { useState } from 'react';
import { SystemButton } from '../../components/SystemButton';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { SystemWindow } from '../../components/SystemWindow';
import { useToast } from '../../components/toastContext';
import { systemCopy } from '../../copy/system';
import { adjustRestSeconds } from '../../game';
import { useSetRestTimer } from '../../lib/mutations/gym';
import { useRestTimerSetting } from '../../lib/queries/gym';
import { systemMessage } from '../../lib/systemError';
import { formatDuration } from '../gym/gymText';

const copy = systemCopy.gym;

/** Brief 4.6: the rest timer default, in config-sized steps. Applies at once. */
export function RestTimerSetting() {
  const setting = useRestTimerSetting();
  const save = useSetRestTimer();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  if (setting.isPending) {
    return (
      <SystemWindow title={copy.restSetting.toUpperCase()}>
        <SystemLoading />
      </SystemWindow>
    );
  }
  if (setting.isError) {
    return (
      <SystemErrorPanel
        message={systemMessage(setting.error, systemCopy.errors.load)}
        onRetry={() => {
          void setting.refetch();
        }}
      />
    );
  }
  const seconds = setting.data;

  function change(steps: number) {
    const next = adjustRestSeconds(seconds, steps);
    if (next === seconds) return;
    setError(null);
    save.mutate(next, {
      onSuccess: () => {
        toast.show({ title: copy.restSetting, lines: [copy.restSaved] });
      },
      onError: (mutationError) => {
        setError(systemMessage(mutationError));
      },
    });
  }

  return (
    <SystemWindow title={copy.restSetting.toUpperCase()}>
      <div className="flex items-center gap-3">
        <SystemButton
          tone="ghost"
          disabled={save.isPending}
          onClick={() => {
            change(-1);
          }}
        >
          {copy.restMinus}
        </SystemButton>
        <span className="flex-1 text-center font-display text-2xl text-system-glow" data-readout>
          {formatDuration(seconds)}
        </span>
        <SystemButton
          tone="ghost"
          disabled={save.isPending}
          onClick={() => {
            change(1);
          }}
        >
          {copy.restPlus}
        </SystemButton>
      </div>
      <p className="pt-2 text-center text-xs text-steel">{copy.restSettingHint}</p>
      {error !== null && (
        <p role="alert" className="pt-2 text-center text-xs text-penalty-text">
          {error}
        </p>
      )}
    </SystemWindow>
  );
}
