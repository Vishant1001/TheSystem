import { Navigate, Outlet } from 'react-router';
import { systemCopy } from '../copy/system';
import { useAuth } from '../features/auth/authContext';
import { useHunterSnapshot } from '../lib/queries/hunterSnapshot';
import { systemMessage } from '../lib/systemError';
import { SystemErrorPanel, SystemLoading, SystemScreenState } from './SystemStates';

/** Signed in, or off to /auth. */
export function RequireSession() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <SystemScreenState>
        <SystemLoading />
      </SystemScreenState>
    );
  }
  if (session === null) return <Navigate to="/auth" replace />;
  return <Outlet />;
}

/** Signed out, or off to Status. Used for /auth. */
export function RequireNoSession() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <SystemScreenState>
        <SystemLoading />
      </SystemScreenState>
    );
  }
  if (session !== null) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Has a hunter record, or off to /onboarding. */
export function RequireHunter() {
  const { data, isPending, isError, error, refetch } = useHunterSnapshot();

  if (isPending) {
    return (
      <SystemScreenState>
        <SystemLoading />
      </SystemScreenState>
    );
  }
  if (isError) {
    return (
      <SystemScreenState>
        <SystemErrorPanel
          message={systemMessage(error, systemCopy.errors.load)}
          onRetry={() => {
            void refetch();
          }}
        />
      </SystemScreenState>
    );
  }
  if (data === null) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Has no hunter record yet, or off to Status. Used for /onboarding. */
export function RequireNoHunter() {
  const { data, isPending, isError, error, refetch } = useHunterSnapshot();

  if (isPending) {
    return (
      <SystemScreenState>
        <SystemLoading />
      </SystemScreenState>
    );
  }
  if (isError) {
    return (
      <SystemScreenState>
        <SystemErrorPanel
          message={systemMessage(error, systemCopy.errors.load)}
          onRetry={() => {
            void refetch();
          }}
        />
      </SystemScreenState>
    );
  }
  if (data !== null) return <Navigate to="/" replace />;
  return <Outlet />;
}

/**
 * Brief 7.2: the System Report is shown automatically once there are closed
 * days to acknowledge. Driven by the snapshot rather than by what close_days()
 * happened to return, so a refresh mid-report still lands here (G9).
 */
export function RequireReportAcknowledged() {
  const { data } = useHunterSnapshot();

  if (data !== null && data !== undefined && data.unacknowledged_days > 0) {
    return <Navigate to="/report" replace />;
  }
  return <Outlet />;
}
