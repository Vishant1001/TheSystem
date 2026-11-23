import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { SystemButton } from './SystemButton';
import { SystemWindow } from './SystemWindow';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  detail?: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** For the irreversible ones: allocation first, Phase 2 will bring others. */
export function ConfirmDialog({
  open,
  title,
  body,
  detail,
  confirmLabel,
  cancelLabel,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-abyss/85 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.1 : 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={pending ? undefined : onCancel}
        >
          <motion.div
            className="w-full max-w-md"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.22, ease: 'easeOut' }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <SystemWindow title={title} animate={false}>
              <div className="flex flex-col gap-4">
                {detail !== undefined && (
                  <p className="font-display text-lg text-system-glow" data-readout>
                    {detail}
                  </p>
                )}
                <p className="text-sm text-steel">{body}</p>
                <div className="flex gap-2">
                  <SystemButton
                    tone="ghost"
                    className="flex-1"
                    onClick={onCancel}
                    disabled={pending}
                  >
                    {cancelLabel}
                  </SystemButton>
                  <SystemButton className="flex-1" onClick={onConfirm} disabled={pending}>
                    {confirmLabel}
                  </SystemButton>
                </div>
              </div>
            </SystemWindow>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
