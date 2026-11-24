import { useState } from 'react';
import { Link } from 'react-router';
import { SystemButton } from '../../components/SystemButton';
import { SystemInput } from '../../components/SystemField';
import { systemCopy } from '../../copy/system';
import { GAME_CONFIG, questXp, type Difficulty } from '../../game';
import type { QuestView } from '../../lib/queries/quests';

interface QuestCardProps {
  view: QuestView;
  pending: boolean;
  /** Live reading for an auto quest, e.g. the calorie window status (5.8). */
  liveStatus?: { text: string; tone: 'steel' | 'system' | 'penalty' } | undefined;
  onComplete: (value: number | null) => void;
  onUndo: () => void;
  /** Brief 3.7: on a rest day this quest does not count towards the day. */
  restOptional?: boolean;
}

const liveTone = {
  steel: 'text-steel/90',
  system: 'text-system-glow',
  penalty: 'text-penalty-text',
} as const;

const difficultyTone: Record<Difficulty, string> = {
  E: 'border-steel/40 text-steel',
  D: 'border-steel/50 text-hunter',
  C: 'border-system/50 text-system-glow',
  B: 'border-system/60 text-system-glow',
  A: 'border-monarch/50 text-monarch-text',
  S: 'border-monarch/70 text-monarch-text',
};

export function QuestCard({
  view,
  pending,
  liveStatus,
  onComplete,
  onUndo,
  restOptional = false,
}: QuestCardProps) {
  const { quest, isDone, isAuto, needsValue, overdue } = view;
  // A Survival Trial (brief 3.4): fixed XP from config, never edited or undone.
  const isTrial = quest.type === 'trial';
  const xp = isTrial ? GAME_CONFIG.penalty.trial.xp : questXp(quest.difficulty as Difficulty);
  const [value, setValue] = useState('');

  const difficulty = quest.difficulty as Difficulty;
  const target = quest.target_value;

  return (
    <li
      className={`flex flex-col gap-2 border-l-2 py-3 pl-3 ${
        isDone ? 'border-system/70' : overdue || isTrial ? 'border-penalty/60' : 'border-steel/25'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            {!isTrial && (
              <span
                className={`shrink-0 border px-1.5 font-display text-[0.625rem] font-bold tracking-widest ${difficultyTone[difficulty]}`}
              >
                {difficulty}
              </span>
            )}
            <h3
              className={`truncate text-sm font-semibold ${isDone ? 'text-steel line-through' : 'text-hunter'}`}
            >
              {quest.title}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-steel">
            {restOptional && (
              <span className="font-display tracking-widest text-steel uppercase">
                {systemCopy.quests.restOptional}
              </span>
            )}
            {quest.is_core && !restOptional && (
              <span className="font-display tracking-widest text-system-glow/80 uppercase">
                {systemCopy.quests.core}
              </span>
            )}
            <span className="font-display tracking-wider uppercase">{quest.category}</span>
            <span>{quest.stat_tags.join(' · ')}</span>
            <span data-readout>+{xp} XP</span>
            {target !== null && (
              <span data-readout>
                {systemCopy.quests.target} {target}
                {quest.unit === null ? '' : ` ${quest.unit}`}
              </span>
            )}
            {quest.type === 'one_time' && (
              <span className={overdue ? 'text-penalty-text' : undefined}>
                {quest.due_on === null
                  ? systemCopy.quests.noDeadline
                  : `${overdue ? systemCopy.quests.overdue : systemCopy.quests.due} ${quest.due_on}`}
              </span>
            )}
          </div>
        </div>

        {!isTrial && (
          <Link
            to={`/quests/${quest.id}/edit`}
            className="shrink-0 font-display text-[0.625rem] tracking-widest text-steel uppercase hover:text-hunter"
          >
            {systemCopy.quests.edit}
          </Link>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isAuto ? (
          <div className="flex flex-wrap items-center gap-x-2">
            <span
              className={`font-display text-[0.6875rem] tracking-wider uppercase ${
                isDone ? 'text-system-glow' : 'text-steel/90'
              }`}
            >
              {isDone
                ? systemCopy.quests.done
                : isTrial
                  ? systemCopy.quests.trialAuto
                  : systemCopy.quests.autoTracked}
            </span>
            {liveStatus !== undefined && (
              <span
                className={`font-display text-[0.6875rem] tracking-wider ${liveTone[liveStatus.tone]}`}
                data-readout
              >
                {liveStatus.text}
              </span>
            )}
          </div>
        ) : isDone ? (
          <>
            <span className="font-display text-[0.6875rem] tracking-wider text-system-glow uppercase">
              {systemCopy.quests.done}
            </span>
            {!isTrial && (
              <SystemButton
                tone="ghost"
                className="ml-auto min-h-9 px-3 text-xs"
                disabled={pending}
                onClick={onUndo}
              >
                {systemCopy.quests.undo}
              </SystemButton>
            )}
          </>
        ) : (
          <>
            {needsValue && (
              <SystemInput
                type="number"
                inputMode="numeric"
                className="min-h-9 w-24 text-sm"
                aria-label={`${systemCopy.quests.valueLabel}: ${quest.title}`}
                placeholder={target === null ? systemCopy.quests.valueLabel : String(target)}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                }}
                disabled={pending}
              />
            )}
            <SystemButton
              tone={isTrial ? 'penalty' : 'system'}
              className="ml-auto min-h-9 px-3 text-xs"
              disabled={pending || (needsValue && value.trim() === '')}
              onClick={() => {
                onComplete(needsValue ? Number(value) : null);
                setValue('');
              }}
            >
              {systemCopy.quests.complete}
            </SystemButton>
          </>
        )}
      </div>
    </li>
  );
}
