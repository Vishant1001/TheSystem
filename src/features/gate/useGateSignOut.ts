import { useState } from 'react';
import { signOut } from '../../lib/auth';

/**
 * Sign out from a gate. The auth listener moves the hunter to /auth once the
 * session ends; a failure re-enables the button so it can be tried again.
 */
export function useGateSignOut(): { signOut: () => void; pending: boolean } {
  const [pending, setPending] = useState(false);
  return {
    pending,
    signOut: () => {
      setPending(true);
      signOut().catch(() => {
        setPending(false);
      });
    },
  };
}
