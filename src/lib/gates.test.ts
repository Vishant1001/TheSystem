import { describe, expect, it } from 'vitest';
import { attentionGate, type HunterSnapshot } from './schemas';
import { errorToken } from './systemError';

function withAttention(attention: HunterSnapshot['attention']): HunterSnapshot {
  // Only `attention` is read by the gate; the rest of the snapshot is irrelevant here.
  return { attention } as HunterSnapshot;
}

describe('attentionGate (brief 3.5: Report -> Penalty -> Level-up)', () => {
  it('shows the report first, even when a penalty also waits', () => {
    expect(
      attentionGate(
        withAttention({
          report_days: 2,
          penalty_needs_choice: true,
          penalty_needs_acknowledgement: false,
        }),
      ),
    ).toBe('report');
  });

  it('then the penalty, for a choice or an acknowledgement', () => {
    expect(
      attentionGate(
        withAttention({
          report_days: 0,
          penalty_needs_choice: true,
          penalty_needs_acknowledgement: false,
        }),
      ),
    ).toBe('penalty');
    expect(
      attentionGate(
        withAttention({
          report_days: 0,
          penalty_needs_choice: false,
          penalty_needs_acknowledgement: true,
        }),
      ),
    ).toBe('penalty');
  });

  it('then nothing, which frees the level-up modal', () => {
    expect(
      attentionGate(
        withAttention({
          report_days: 0,
          penalty_needs_choice: false,
          penalty_needs_acknowledgement: false,
        }),
      ),
    ).toBeNull();
  });
});

describe('errorToken', () => {
  it('reads the stable token an RPC raised', () => {
    expect(errorToken({ message: 'TRIAL_EXPIRED' })).toBe('TRIAL_EXPIRED');
    expect(errorToken(new Error('INVALID_PENALTY_TRANSITION: cleared -> trial_active'))).toBe(
      'INVALID_PENALTY_TRANSITION',
    );
  });

  it('ignores anything that is not a token', () => {
    expect(errorToken(new Error('Failed to fetch'))).toBeNull();
    expect(errorToken(null)).toBeNull();
  });
});
