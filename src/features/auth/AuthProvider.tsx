import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { AuthContext, type AuthState } from './authContext';

/**
 * Holds the Supabase session and keeps it in step with the client. Signing out
 * drops every cached query so one hunter's data can never be shown to another.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    let active = true;

    const apply = (session: Session | null) => {
      if (active) setState({ session, loading: false });
    };

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        apply(data.session);
      })
      .catch(() => {
        apply(null);
      });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      apply(session);
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
