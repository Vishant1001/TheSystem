import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SystemButton } from '../../components/SystemButton';
import { useToast } from '../../components/toastContext';
import { systemCopy } from '../../copy/system';
import { canSpendStone } from '../../game';
import { useRedeemPenalty } from '../../lib/mutations/penalty';
import type { HunterSnapshot } from '../../lib/schemas';
import { systemMessage } from '../../lib/systemError';

/**
 * Brief 3.6: spend a Redemption Stone on the open penalty, behind a confirm
 * dialog. Hidden when no stone is held; in Hardcore it explains the freeze.
 */
export function RedeemButton({
  snapshot,
  onFailed,
}: {
  snapshot: HunterSnapshot;
  /** On a gate, failures go to the gate's Retry panel instead of a toast. */
  onFailed?: (error: unknown, retry: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const redeem = useRedeemPenalty();
  const toast = useToast();
  const penalty = snapshot.penalty;
  const held = snapshot.safe_zones.stones_held;
  const mode = snapshot.safe_zones.rules_today.penalty_mode;

  if (penalty === null || held <= 0) return null;
  if (!canSpendStone(held, mode)) {
    return <p className="text-xs text-steel">{systemCopy.penalty.stonesFrozen}</p>;
  }

  return (
    <>
      <SystemButton
        tone="ghost"
        className="w-full"
        disabled={redeem.isPending}
        onClick={() => {
          setOpen(true);
        }}
      >
        {systemCopy.penalty.redeem} ({held})
      </SystemButton>
      <ConfirmDialog
        open={open}
        title={systemCopy.penalty.redeemTitle}
        detail={systemCopy.penalty.stonesHeld(held)}
        body={systemCopy.penalty.redeemBody}
        confirmLabel={
          redeem.isPending ? systemCopy.penalty.redeeming : systemCopy.penalty.redeemConfirm
        }
        cancelLabel={systemCopy.penalty.redeemCancel}
        pending={redeem.isPending}
        onCancel={() => {
          setOpen(false);
        }}
        onConfirm={() => {
          const spend = () => {
            redeem.mutate(penalty.id, {
              onSuccess: () => {
                toast.show({ title: systemCopy.penalty.redeemed, lines: [] });
              },
              onError: (error) => {
                if (onFailed !== undefined) {
                  onFailed(error, spend);
                  return;
                }
                toast.show({
                  title: systemCopy.errors.generic,
                  lines: [systemMessage(error)],
                  tone: 'penalty',
                });
              },
              onSettled: () => {
                setOpen(false);
              },
            });
          };
          spend();
        }}
      />
    </>
  );
}
