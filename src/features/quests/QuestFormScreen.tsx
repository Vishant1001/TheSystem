import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';

interface QuestFormScreenProps {
  mode: 'create' | 'edit';
}

export function QuestFormScreen({ mode }: QuestFormScreenProps) {
  return (
    <SystemWindow
      title={systemCopy.windows.questDesigner}
      headerAside={mode === 'edit' ? 'EDIT' : 'NEW'}
    >
      <p className="text-sm text-steel">{systemCopy.pending.questDesigner}</p>
    </SystemWindow>
  );
}
