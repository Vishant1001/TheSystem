import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export interface AuthState {
  session: Session | null;
  /** True until the first session lookup resolves, so guards never flash. */
  loading: boolean;
}

export const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
