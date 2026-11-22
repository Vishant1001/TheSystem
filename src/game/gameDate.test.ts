import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from './config';
import { gameDateAt, gameToday } from './gameDate';
import vectors from './testdata/game-date-vectors.json';

/**
 * These vectors are shared with SQL: supabase/tests/game_date_parity.sql is
 * generated from this same file, so the engine and the database can never
 * disagree about which game day an instant belongs to (C5).
 */
describe('gameDateAt', () => {
  it.each(vectors)('$note', ({ instant, timeZone, startHour, expected }) => {
    expect(gameDateAt(new Date(instant), timeZone, startHour)).toBe(expected);
  });

  it('defaults to the configured rollover hour', () => {
    expect(GAME_CONFIG.dayRollover.startHour).toBe(3);
    expect(gameDateAt(new Date('2026-01-15T01:00:00Z'), 'Europe/Berlin')).toBe('2026-01-14');
    expect(gameDateAt(new Date('2026-01-15T03:00:00Z'), 'Europe/Berlin')).toBe('2026-01-15');
  });

  it('never moves a date by more than one day', () => {
    const instant = new Date('2026-05-20T12:00:00Z');
    for (let startHour = 0; startHour <= 23; startHour += 1) {
      const date = gameDateAt(instant, 'Europe/Berlin', startHour);
      expect(['2026-05-19', '2026-05-20']).toContain(date);
    }
  });

  it('rejects invalid input', () => {
    expect(() => gameDateAt(new Date('nope'), 'Europe/Berlin')).toThrow(RangeError);
    expect(() => gameDateAt(new Date('2026-01-15T01:00:00Z'), 'Europe/Berlin', 24)).toThrow(
      RangeError,
    );
    expect(() => gameDateAt(new Date('2026-01-15T01:00:00Z'), 'Europe/Berlin', -1)).toThrow(
      RangeError,
    );
    expect(() => gameDateAt(new Date('2026-01-15T01:00:00Z'), 'Not/AZone')).toThrow();
  });
});

describe('gameToday', () => {
  it('is gameDateAt with the clock passed in by the caller (ADR-2)', () => {
    const now = new Date('2026-02-02T02:00:00Z');
    expect(gameToday('Europe/Berlin', now)).toBe(gameDateAt(now, 'Europe/Berlin'));
  });
});
