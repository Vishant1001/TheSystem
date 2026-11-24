import { Link } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { SystemLink } from '../../components/SystemLink';
import { SystemErrorPanel, SystemLoading } from '../../components/SystemStates';
import { SystemWindow } from '../../components/SystemWindow';
import { systemCopy } from '../../copy/system';
import { bossReward, DIFFICULTIES, GAME_CONFIG, type Difficulty } from '../../game';
import { useBosses, type BossRow } from '../../lib/queries/gym';
import { systemMessage } from '../../lib/systemError';
import { formatKg } from './gymText';

const copy = systemCopy.gym;

function bossName(boss: BossRow): string {
  return boss.name ?? boss.exercises?.name ?? '';
}

function difficultyOf(boss: BossRow): Difficulty {
  return DIFFICULTIES.find((d) => d === boss.difficulty) ?? 'E';
}

/** Quests screen (brief 7): open boss gates, then the trophy list. */
export function BossesSection() {
  const bosses = useBosses();

  if (bosses.isPending) return <SystemLoading />;
  if (bosses.isError) {
    return (
      <SystemErrorPanel
        message={systemMessage(bosses.error, systemCopy.errors.load)}
        onRetry={() => {
          void bosses.refetch();
        }}
      />
    );
  }

  const active = bosses.data.filter((boss) => boss.defeated_on === null);
  const trophies = bosses.data
    .filter((boss) => boss.defeated_on !== null)
    .sort((a, b) => ((a.defeated_on ?? '') < (b.defeated_on ?? '') ? 1 : -1));
  const full = active.length >= GAME_CONFIG.gym.boss.maxActive;

  return (
    <>
      <SystemWindow
        title={systemCopy.windows.bosses}
        headerAside={`${String(active.length)}/${String(GAME_CONFIG.gym.boss.maxActive)}`}
      >
        {active.length === 0 ? (
          <EmptyState message={copy.noBosses} />
        ) : (
          <ul className="flex flex-col divide-y divide-system/10">
            {active.map((boss) => {
              const reward = bossReward(difficultyOf(boss));
              return (
                <li key={boss.id} className="flex items-center gap-3 py-2">
                  <span className="font-display text-lg font-bold text-monarch-text" aria-hidden>
                    {boss.difficulty}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-hunter">{bossName(boss)}</span>
                    <span className="block font-display text-xs text-steel" data-readout>
                      {copy.target(formatKg(boss.target_weight_kg), boss.target_reps)} ·{' '}
                      {copy.reward(reward.xp, reward.freePoints)}
                    </span>
                  </span>
                  <Link
                    to={`/bosses/${boss.id}/edit`}
                    className="min-h-9 px-2 py-2 font-display text-xs tracking-[0.14em] text-steel uppercase"
                  >
                    {copy.edit}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <div className="pt-3">
          {full ? (
            <p className="text-center text-xs text-steel">{copy.bossLimit}</p>
          ) : (
            <SystemLink to="/bosses/new" tone="ghost" className="w-full">
              + {copy.addBoss}
            </SystemLink>
          )}
        </div>
      </SystemWindow>

      {trophies.length > 0 && (
        <SystemWindow title={systemCopy.windows.trophies} variant="monarch">
          <ul className="flex flex-col divide-y divide-monarch/15">
            {trophies.map((boss) => (
              <li key={boss.id} className="flex flex-col py-2">
                <span className="text-sm text-hunter">{bossName(boss)}</span>
                <span className="font-display text-xs text-steel" data-readout>
                  {copy.target(formatKg(boss.target_weight_kg), boss.target_reps)} ·{' '}
                  {copy.defeatedOn(boss.defeated_on ?? '')}
                </span>
              </li>
            ))}
          </ul>
        </SystemWindow>
      )}
    </>
  );
}
