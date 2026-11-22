import { EmptyState } from '../../components/EmptyState';
import { SystemLink } from '../../components/SystemLink';
import { SystemWindow } from '../../components/SystemWindow';
import { PlusIcon } from '../../components/icons';
import { systemCopy } from '../../copy/system';

export function QuestsScreen() {
  return (
    <>
      <SystemWindow title={systemCopy.windows.dailyQuest}>
        <EmptyState message={systemCopy.empty.quests} />
      </SystemWindow>

      <SystemWindow title={systemCopy.windows.oneTimeQuest}>
        <EmptyState message={systemCopy.empty.oneTimeQuests} />
      </SystemWindow>

      <SystemLink to="/quests/new" className="w-full">
        <PlusIcon className="size-4" />
        {systemCopy.actions.addQuest}
      </SystemLink>
    </>
  );
}
