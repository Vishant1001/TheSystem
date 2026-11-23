import { describe, expect, it } from 'vitest';
import type { PenaltyMode } from './config';
import {
  checkSafePeriod,
  effectiveEnd,
  endEarlyOn,
  isSafeOn,
  maxBookableDays,
  safePeriodStart,
  type SafePeriod,
} from './safeZones';
import vectors from './testdata/safe-zone-vectors.json';

/**
 * TypeScript half of the Safe Zone parity suite (3.8). The SQL half is
 * generated from the same JSON in 2.2.
 */
describe('safe period start vectors', () => {
  it.each(vectors.start)('$note', (vector) => {
    expect(safePeriodStart(new Date(vector.now), vector.timeZone, vector.mode as PenaltyMode)).toBe(
      vector.expected,
    );
  });
});

describe('safe period quota vectors', () => {
  it.each(vectors.quota)('$note', (vector) => {
    expect(checkSafePeriod(vector.existing as SafePeriod[], vector.startOn, vector.days)).toBe(
      vector.expected,
    );
  });
});

describe('safe periods', () => {
  const week: SafePeriod = { startOn: '2026-12-01', endOn: '2026-12-07', endedEarlyOn: null };

  it('covers its days inclusively', () => {
    expect(isSafeOn([week], '2026-11-30')).toBe(false);
    expect(isSafeOn([week], '2026-12-01')).toBe(true);
    expect(isSafeOn([week], '2026-12-07')).toBe(true);
    expect(isSafeOn([week], '2026-12-08')).toBe(false);
  });

  it('ends early from the next game day', () => {
    const ended = { ...week, endedEarlyOn: endEarlyOn('2026-12-03') };
    expect(ended.endedEarlyOn).toBe('2026-12-04');
    expect(effectiveEnd(ended)).toBe('2026-12-03');
    expect(isSafeOn([ended], '2026-12-03')).toBe(true);
    expect(isSafeOn([ended], '2026-12-04')).toBe(false);
  });

  it('can be cancelled before it starts', () => {
    const cancelled = { ...week, endedEarlyOn: '2026-12-01' };
    expect(isSafeOn([cancelled], '2026-12-01')).toBe(false);
  });

  it('reports the longest period still bookable', () => {
    expect(maxBookableDays([], '2026-12-10')).toBe(7);
    expect(maxBookableDays([week], '2026-12-10')).toBe(3);
    expect(
      maxBookableDays(
        [week, { startOn: '2026-12-08', endOn: '2026-12-10', endedEarlyOn: null }],
        '2026-12-12',
      ),
    ).toBe(0);
  });
});
