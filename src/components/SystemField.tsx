import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

const controlClass =
  'min-h-11 w-full border border-system/40 bg-abyss/70 px-3 text-base text-hunter outline-none transition-colors placeholder:text-steel/60 focus:border-system-glow focus:shadow-system-glow';

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
}

/** Label, control and validation message in the System's voice. */
export function SystemField({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="font-display text-xs font-semibold tracking-[0.18em] text-steel uppercase"
      >
        {label}
      </label>
      {children}
      {hint !== undefined && error === undefined && <p className="text-xs text-steel/80">{hint}</p>}
      {error !== undefined && (
        <p role="alert" className="text-xs text-penalty-text">
          {error}
        </p>
      )}
    </div>
  );
}

export function SystemInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlClass} ${className}`} {...rest} />;
}

export function SystemSelect({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${controlClass} ${className}`} {...rest} />;
}
