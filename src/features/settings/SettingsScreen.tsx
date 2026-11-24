import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { HunterProfileForm } from '../../components/HunterProfileForm';
import { SystemButton } from '../../components/SystemButton';
import { SystemLink } from '../../components/SystemLink';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';
import { signOut } from '../../lib/auth';
import { hunterSnapshotKey, useHunterSnapshot } from '../../lib/queries/hunterSnapshot';
import { hunterSnapshotSchema, type HunterProfileInput } from '../../lib/schemas';
import { supabase } from '../../lib/supabase';
import { systemMessage } from '../../lib/systemError';
import { RestTimerSetting } from './RestTimerSetting';

/**
 * Hunter Settings (C4). Name and timezone apply immediately; the diet targets
 * are versioned server-side and take effect from the next game day, so the day
 * you are living is never re-judged (C8). Closed days are never revisited.
 */
export function SettingsScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error, refetch } = useHunterSnapshot();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: async (input: HunterProfileInput) => {
      const { data: updated, error: rpcError } = await supabase.rpc('update_hunter_profile', {
        p_hunter_name: input.hunterName,
        p_timezone: input.timezone,
        p_kcal_min: input.kcalMin,
        p_kcal_max: input.kcalMax,
        p_protein_target_g: input.proteinTargetG,
      });
      if (rpcError) throw rpcError;
      return hunterSnapshotSchema.parse(updated);
    },
    onSuccess: (snapshot) => {
      queryClient.setQueryData(hunterSnapshotKey, snapshot);
      setSaved(true);
    },
    onError: (mutationError) => {
      setFormError(systemMessage(mutationError));
    },
    // The RPC may have committed even if the client could not read the reply.
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: hunterSnapshotKey });
    },
  });

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

  const effective = data.effective_targets_today;
  const pendingChange =
    effective.kcal_min !== data.hunter.kcal_min ||
    effective.kcal_max !== data.hunter.kcal_max ||
    effective.protein_target_g !== data.hunter.protein_target_g;

  return (
    <>
      <SystemWindow title={systemCopy.windows.settings}>
        <p className="mb-4 text-sm text-steel">{systemCopy.settings.prompt}</p>

        <HunterProfileForm
          initialValues={{
            hunterName: data.hunter.hunter_name,
            timezone: data.hunter.timezone,
            kcalMin: data.hunter.kcal_min,
            kcalMax: data.hunter.kcal_max,
            proteinTargetG: data.hunter.protein_target_g,
          }}
          submitLabel={systemCopy.settings.save}
          pendingLabel={systemCopy.settings.working}
          pending={save.isPending}
          formError={formError}
          onSubmit={(input) => {
            setFormError(null);
            setSaved(false);
            save.mutate(input);
          }}
          footer={
            <>
              <p className="text-center text-xs text-steel/80">{systemCopy.settings.effective}</p>
              {saved && (
                <p className="text-center text-xs text-system-glow">{systemCopy.settings.saved}</p>
              )}
            </>
          }
        />
      </SystemWindow>

      <SystemWindow title={systemCopy.settings.inForceToday} headerAside={data.game_today}>
        <ul className="flex flex-col gap-1.5 text-sm">
          <li className="flex justify-between">
            <span className="text-steel">{systemCopy.onboarding.kcalLabel}</span>
            <span className="font-display text-hunter" data-readout>
              {effective.kcal_min} – {effective.kcal_max}
            </span>
          </li>
          <li className="flex justify-between">
            <span className="text-steel">{systemCopy.onboarding.proteinLabel}</span>
            <span className="font-display text-hunter" data-readout>
              {effective.protein_target_g} {systemCopy.onboarding.proteinUnit}
            </span>
          </li>
        </ul>
        {pendingChange && (
          <p className="pt-3 text-xs text-system-glow">{systemCopy.settings.pendingChange}</p>
        )}
      </SystemWindow>

      <RestTimerSetting />

      <SystemLink to="/settings/safe-zones" className="w-full">
        {systemCopy.safeZones.open}
      </SystemLink>

      <div className="flex justify-center gap-3 pb-2">
        <SystemButton
          tone="ghost"
          onClick={() => {
            void navigate('/');
          }}
        >
          {systemCopy.actions.returnToStatus}
        </SystemButton>
        <SystemButton
          tone="ghost"
          onClick={() => {
            void signOut();
          }}
        >
          {systemCopy.auth.signOut}
        </SystemButton>
      </div>
    </>
  );
}
