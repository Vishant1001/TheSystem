import { describe, expect, it } from 'vitest';
import { formatCountdown, penaltyCountdown, shouldShowPenaltyWarning } from './countdown';
import { addDays, daysBetween, wallTimeToInstant } from './dates';

const BERLIN = 'Europe/Berlin';
const at = (iso: string) => new Date(iso);
const HOUR = 3_600_000;

describe('calendar helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-12-01', '2026-12-31')).toBe(30);
  });

  it('rejects impossible dates', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
  });
});

describe('wallTimeToInstant', () => {
  it('converts a winter and a summer wall time', () => {
    expect(wallTimeToInstant('2026-01-15', 23, BERLIN).toISOString()).toBe(
      '2026-01-15T22:00:00.000Z',
    );
    expect(wallTimeToInstant('2026-07-15', 23, BERLIN).toISOString()).toBe(
      '2026-07-15T21:00:00.000Z',
    );
  });

  it('pushes a skipped hour forward (spring, last Sunday of March)', () => {
    // 02:00 does not exist on 2026-03-29 in Berlin; it means 03:00 CEST.
    expect(wallTimeToInstant('2026-03-29', 2, BERLIN).toISOString()).toBe(
      '2026-03-29T01:00:00.000Z',
    );
    expect(wallTimeToInstant('2026-03-29', 3, BERLIN).toISOString()).toBe(
      '2026-03-29T01:00:00.000Z',
    );
  });

  it('resolves a repeated hour to the later instant (autumn, last Sunday of October)', () => {
    expect(wallTimeToInstant('2026-10-25', 2, BERLIN).toISOString()).toBe(
      '2026-10-25T01:00:00.000Z',
    );
    expect(wallTimeToInstant('2026-10-25', 3, BERLIN).toISOString()).toBe(
      '2026-10-25T02:00:00.000Z',
    );
  });

  it('handles a half-hour zone with no DST', () => {
    expect(wallTimeToInstant('2026-12-07', 23, 'Asia/Kolkata').toISOString()).toBe(
      '2026-12-07T17:30:00.000Z',
    );
  });
});

describe('penaltyCountdown (3.2)', () => {
  it('is closed before the Standard warning hour', () => {
    const countdown = penaltyCountdown(at('2026-01-15T21:30:00Z'), BERLIN, 'standard');
    expect(countdown.gameDate).toBe('2026-01-15');
    expect(countdown.inWarningWindow).toBe(false);
    expect(countdown.warningStartsAt.toISOString()).toBe('2026-01-15T22:00:00.000Z');
    expect(countdown.dayEndsAt.toISOString()).toBe('2026-01-16T02:00:00.000Z');
  });

  it('opens at 23:00 with four hours to go', () => {
    const countdown = penaltyCountdown(at('2026-01-15T22:00:00Z'), BERLIN, 'standard');
    expect(countdown.inWarningWindow).toBe(true);
    expect(formatCountdown(countdown.msRemaining)).toBe('04:00:00');
  });

  it('runs past midnight into the same game day', () => {
    const countdown = penaltyCountdown(at('2026-01-16T01:59:59Z'), BERLIN, 'standard');
    expect(countdown.gameDate).toBe('2026-01-15');
    expect(countdown.inWarningWindow).toBe(true);
    expect(formatCountdown(countdown.msRemaining)).toBe('00:00:01');
  });

  it('closes exactly at the rollover, when a new day starts', () => {
    const countdown = penaltyCountdown(at('2026-01-16T02:00:00Z'), BERLIN, 'standard');
    expect(countdown.gameDate).toBe('2026-01-16');
    expect(countdown.inWarningWindow).toBe(false);
    expect(countdown.msRemaining).toBe(24 * HOUR);
  });

  it('opens at 21:00 in Lenient', () => {
    const countdown = penaltyCountdown(at('2026-01-15T20:00:00Z'), BERLIN, 'lenient');
    expect(countdown.inWarningWindow).toBe(true);
    expect(formatCountdown(countdown.msRemaining)).toBe('06:00:00');
  });

  it('is three hours long on the spring-forward night', () => {
    const countdown = penaltyCountdown(at('2026-03-28T22:00:00Z'), BERLIN, 'standard');
    expect(countdown.gameDate).toBe('2026-03-28');
    expect(countdown.inWarningWindow).toBe(true);
    expect(countdown.dayEndsAt.toISOString()).toBe('2026-03-29T01:00:00.000Z');
    expect(formatCountdown(countdown.msRemaining)).toBe('03:00:00');
  });

  it('is five hours long on the fall-back night, through both 02:30s', () => {
    const start = penaltyCountdown(at('2026-10-24T21:00:00Z'), BERLIN, 'standard');
    expect(start.inWarningWindow).toBe(true);
    expect(formatCountdown(start.msRemaining)).toBe('05:00:00');

    const firstHalfPastTwo = penaltyCountdown(at('2026-10-25T00:30:00Z'), BERLIN, 'standard');
    const secondHalfPastTwo = penaltyCountdown(at('2026-10-25T01:30:00Z'), BERLIN, 'standard');
    expect(firstHalfPastTwo.gameDate).toBe('2026-10-24');
    expect(secondHalfPastTwo.gameDate).toBe('2026-10-24');
    expect(formatCountdown(firstHalfPastTwo.msRemaining)).toBe('01:30:00');
    expect(formatCountdown(secondHalfPastTwo.msRemaining)).toBe('00:30:00');
  });

  it('is a normal day on the DST Sunday itself', () => {
    const countdown = penaltyCountdown(at('2026-03-29T21:00:00Z'), BERLIN, 'standard');
    expect(countdown.gameDate).toBe('2026-03-29');
    expect(countdown.inWarningWindow).toBe(true);
    expect(formatCountdown(countdown.msRemaining)).toBe('04:00:00');
  });
});

describe('formatCountdown', () => {
  it('rounds up partial seconds and never goes negative', () => {
    expect(formatCountdown(1)).toBe('00:00:01');
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(-5000)).toBe('00:00:00');
    expect(formatCountdown(36_000_000 + 61_000)).toBe('10:01:01');
  });
});

describe('shouldShowPenaltyWarning (3.2)', () => {
  const open = penaltyCountdown(at('2026-01-15T22:30:00Z'), BERLIN, 'standard');
  const closed = penaltyCountdown(at('2026-01-15T12:00:00Z'), BERLIN, 'standard');

  it('shows only in the window, on a normal day, with core quests open', () => {
    expect(shouldShowPenaltyWarning({ countdown: open, dayKind: 'normal', coreRemaining: 1 })).toBe(
      true,
    );
    expect(
      shouldShowPenaltyWarning({ countdown: closed, dayKind: 'normal', coreRemaining: 1 }),
    ).toBe(false);
    expect(shouldShowPenaltyWarning({ countdown: open, dayKind: 'normal', coreRemaining: 0 })).toBe(
      false,
    );
    expect(shouldShowPenaltyWarning({ countdown: open, dayKind: 'rest', coreRemaining: 2 })).toBe(
      false,
    );
    expect(shouldShowPenaltyWarning({ countdown: open, dayKind: 'safe', coreRemaining: 2 })).toBe(
      false,
    );
  });
});

describe('the warning window never crosses into the next day', () => {
  it('always ends at the next rollover, for every hour of a DST year', () => {
    for (
      let ms = Date.parse('2026-01-01T00:00:00Z');
      ms < Date.parse('2027-01-01T00:00:00Z');
      ms += 7 * HOUR
    ) {
      const countdown = penaltyCountdown(new Date(ms), BERLIN, 'standard');
      expect(countdown.dayEndsAt.getTime()).toBeGreaterThan(ms);
      const length = countdown.dayEndsAt.getTime() - countdown.warningStartsAt.getTime();
      expect([3 * HOUR, 4 * HOUR, 5 * HOUR]).toContain(length);
    }
  });
});
