export type ButtonTone = 'system' | 'penalty' | 'ghost';

const base =
  'font-display inline-flex min-h-11 items-center justify-center gap-2 border px-4 text-sm font-semibold tracking-[0.12em] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const tones: Record<ButtonTone, string> = {
  system: 'border-system/70 bg-system/15 text-system-glow hover:bg-system/25 active:bg-system/35',
  penalty:
    'border-penalty/70 bg-penalty/15 text-penalty-text hover:bg-penalty/25 active:bg-penalty/35',
  ghost: 'border-steel/40 bg-transparent text-steel hover:border-steel/70 hover:text-hunter',
};

/** Shared System control styling for both <button> and <Link>. */
export function systemControlClass(tone: ButtonTone = 'system', extra = ''): string {
  return `${base} ${tones[tone]} ${extra}`;
}
