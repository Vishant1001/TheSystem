import { EmptyState } from '../../components/EmptyState';
import { SystemLink } from '../../components/SystemLink';
import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';

export function StatusScreen() {
  return (
    <SystemWindow title={systemCopy.windows.status}>
      <EmptyState
        message={systemCopy.empty.status}
        action={
          <SystemLink to="/auth" tone="ghost">
            {systemCopy.actions.access}
          </SystemLink>
        }
      />
    </SystemWindow>
  );
}
