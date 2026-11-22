import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

/** Hunter status: a shield with an ascending mark. */
export function StatusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 20 6v6c0 4-3.4 7.4-8 9-4.6-1.6-8-5-8-9V6l8-3Z" />
      <path d="M8.5 13.5 12 10l3.5 3.5" />
    </svg>
  );
}

/** Quests: a checklist. */
export function QuestIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6.5 6 8.5 9.5 5" />
      <path d="M4 17.5 6 19.5 9.5 16" />
      <path d="M13 7h7M13 18h7" />
    </svg>
  );
}

/** Log: an entry added to a record. */
export function LogIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M9 11h6M12 8v6" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
