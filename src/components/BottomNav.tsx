import { NavLink } from 'react-router';
import { systemCopy } from '../copy/system';
import { LogIcon, QuestIcon, StatusIcon } from './icons';

const items = [
  { to: '/', label: systemCopy.nav.status, Icon: StatusIcon, end: true },
  { to: '/quests', label: systemCopy.nav.quests, Icon: QuestIcon, end: false },
  { to: '/log', label: systemCopy.nav.log, Icon: LogIcon, end: false },
];

export function BottomNav() {
  return (
    <nav
      aria-label={systemCopy.app.name}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-system/30 bg-abyss/95 backdrop-blur"
    >
      <ul className="mx-auto flex w-full max-w-md pb-safe">
        {items.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'flex min-h-14 flex-col items-center justify-center gap-1 pt-2 text-[0.6875rem] tracking-[0.14em] uppercase transition-colors',
                  isActive ? 'text-system-glow' : 'text-steel hover:text-hunter active:text-hunter',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`size-5 ${isActive ? 'drop-shadow-[0_0_6px_#7fd8ff]' : ''}`} />
                  <span className="font-display font-semibold">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
