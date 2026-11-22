import { supabase } from './supabase';
import type { Credentials } from './schemas';

export interface SignUpResult {
  /** True when the project requires email confirmation before a session exists. */
  needsConfirmation: boolean;
}

export async function signIn({ email, password }: Credentials): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp({ email, password }: Credentials): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { needsConfirmation: data.session === null };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
