import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { HunterProfileForm } from '../../components/HunterProfileForm';
import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';
import { hunterSnapshotKey } from '../../lib/queries/hunterSnapshot';
import { hunterSnapshotSchema, type HunterProfileInput } from '../../lib/schemas';
import { supabase } from '../../lib/supabase';
import { systemMessage } from '../../lib/systemError';

export function OnboardingScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const onboard = useMutation({
    mutationFn: async (input: HunterProfileInput) => {
      const { data, error } = await supabase.rpc('onboard_hunter', {
        p_hunter_name: input.hunterName,
        p_timezone: input.timezone,
        p_kcal_min: input.kcalMin,
        p_kcal_max: input.kcalMax,
        p_protein_target_g: input.proteinTargetG,
      });
      if (error) throw error;
      return hunterSnapshotSchema.parse(data);
    },
    onSuccess: (snapshot) => {
      queryClient.setQueryData(hunterSnapshotKey, snapshot);
      void navigate('/', { replace: true });
    },
    onError: (error) => {
      setFormError(systemMessage(error));
    },
    // The RPC may have committed even if the client could not read the reply.
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: hunterSnapshotKey });
    },
  });

  return (
    <SystemWindow title={systemCopy.windows.registration}>
      <p className="mb-4 text-sm text-steel">{systemCopy.onboarding.prompt}</p>
      <HunterProfileForm
        submitLabel={systemCopy.onboarding.submit}
        pendingLabel={systemCopy.onboarding.working}
        pending={onboard.isPending}
        formError={formError}
        onSubmit={(input) => {
          setFormError(null);
          onboard.mutate(input);
        }}
        footer={<p className="text-center text-xs text-steel/80">{systemCopy.onboarding.seeded}</p>}
      />
    </SystemWindow>
  );
}
