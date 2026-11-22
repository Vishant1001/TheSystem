import { EmptyState } from '../../components/EmptyState';
import { SystemLink } from '../../components/SystemLink';
import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';

export function ReportScreen() {
  return (
    <SystemWindow title={systemCopy.windows.report}>
      <EmptyState
        message={systemCopy.empty.report}
        action={
          <SystemLink to="/" tone="ghost">
            {systemCopy.actions.returnToStatus}
          </SystemLink>
        }
      />
    </SystemWindow>
  );
}
