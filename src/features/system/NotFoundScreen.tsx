import { SystemLink } from '../../components/SystemLink';
import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';

export function NotFoundScreen() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4">
      <SystemWindow title={systemCopy.windows.unknownGate} className="w-full">
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <p className="text-sm text-steel">{systemCopy.errors.notFound}</p>
          <SystemLink to="/" tone="ghost">
            {systemCopy.actions.returnToStatus}
          </SystemLink>
        </div>
      </SystemWindow>
    </div>
  );
}
