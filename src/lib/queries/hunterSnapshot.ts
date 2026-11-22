import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { hunterSnapshotSchema, type HunterSnapshot } from '../schemas';

/** Invalidate this after any mutation that touches the ledger (brief 7.4). */
export const hunterSnapshotKey = ['hunter-snapshot'] as const;

/** Returns null when the account has no hunter record yet (pre-onboarding). */
export async function fetchHunterSnapshot(): Promise<HunterSnapshot | null> {
  const { data, error } = await supabase.rpc('hunter_snapshot');
  if (error) throw error;
  if (data === null) return null;
  return hunterSnapshotSchema.parse(data);
}

export function useHunterSnapshot() {
  return useQuery({
    queryKey: hunterSnapshotKey,
    queryFn: fetchHunterSnapshot,
  });
}
