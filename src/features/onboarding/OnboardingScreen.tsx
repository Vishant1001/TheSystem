import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';

export function OnboardingScreen() {
  return (
    <SystemWindow title={systemCopy.windows.registration}>
      <p className="text-sm text-steel">{systemCopy.pending.registration}</p>
    </SystemWindow>
  );
}
