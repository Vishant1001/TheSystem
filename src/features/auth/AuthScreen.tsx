import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';

export function AuthScreen() {
  return (
    <SystemWindow title={systemCopy.windows.access}>
      <p className="text-sm text-steel">{systemCopy.pending.access}</p>
    </SystemWindow>
  );
}
