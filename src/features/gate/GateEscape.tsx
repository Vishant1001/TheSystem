import type { ReactNode } from 'react';
import { SystemButton } from '../../components/SystemButton';
import { SystemErrorPanel } from '../../components/SystemStates';
import { systemCopy } from '../../copy/system';
import { systemMessage } from '../../lib/systemError';

/**
 * The Report and Penalty gates block all navigation (brief 3.5), but they must
 * never become a dead end. These are the only ways out they offer: Retry on a
 * failure, and Sign out. Pure presentational pieces - the screens supply the
 * callbacks - so they render the same in the app and under test.
 */

interface SignOutProps {
  onSignOut: () => void;
  pending?: boolean;
}

export function GateSignOut({ onSignOut, pending = false }: SignOutProps) {
  return (
    <div className="flex justify-center pb-2">
      <SystemButton tone="ghost" disabled={pending} onClick={onSignOut}>
        {systemCopy.auth.signOut}
      </SystemButton>
    </div>
  );
}

interface GateLayoutProps extends SignOutProps {
  /** The last RPC failure on this gate, or null. */
  failure: unknown;
  onRetry: () => void;
  children: ReactNode;
}

/**
 * A gate screen: the gate's own content, which stays mounted so Retry re-runs
 * the action that failed; the failure (with Retry) right below it, next to
 * the button just tapped; then Sign out. Nothing else - no other navigation leaves a gate.
 */
export function GateLayout({
  failure,
  onRetry,
  onSignOut,
  pending = false,
  children,
}: GateLayoutProps) {
  return (
    <>
      {children}
      {failure !== null && failure !== undefined && (
        <SystemErrorPanel message={systemMessage(failure)} onRetry={onRetry} />
      )}
      <GateSignOut onSignOut={onSignOut} pending={pending} />
    </>
  );
}

interface GateFailureProps extends SignOutProps {
  /** A load or RPC failure; shown in System voice, never raw. */
  error: unknown;
  onRetry: () => void;
}

export function GateFailure({ error, onRetry, onSignOut, pending = false }: GateFailureProps) {
  return (
    <>
      <SystemErrorPanel message={systemMessage(error)} onRetry={onRetry} />
      <GateSignOut onSignOut={onSignOut} pending={pending} />
    </>
  );
}
