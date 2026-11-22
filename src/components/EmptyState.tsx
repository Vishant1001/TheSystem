import type { ReactNode } from 'react';

interface EmptyStateProps {
  message: string;
  /** Optional call to action (link or button). */
  action?: ReactNode;
}

/** The System's voice for "there is nothing here yet". */
export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <p className="text-sm text-steel">{message}</p>
      {action}
    </div>
  );
}
