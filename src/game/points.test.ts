import { describe, expect, it } from 'vitest';
import { canAllocate, freePointsAvailable, freePointsEarned } from './points';

describe('freePointsEarned', () => {
  it('gives a new hunter nothing (5.4)', () => {
    expect(freePointsEarned({ level: 1, freePointsFromEvents: 0 })).toBe(0);
  });

  it('gives 3 per level gained (5.4)', () => {
    expect(freePointsEarned({ level: 2, freePointsFromEvents: 0 })).toBe(3);
    expect(freePointsEarned({ level: 5, freePointsFromEvents: 0 })).toBe(12);
  });

  it('adds free points carried by ledger events, such as daily clears (5.4)', () => {
    expect(freePointsEarned({ level: 1, freePointsFromEvents: 3 })).toBe(3);
    expect(freePointsEarned({ level: 4, freePointsFromEvents: 6 })).toBe(15);
  });
});

describe('freePointsAvailable', () => {
  it('subtracts allocations (5.4)', () => {
    expect(freePointsAvailable({ level: 5, freePointsFromEvents: 2, allocatedPoints: 4 })).toBe(10);
  });

  it('never goes negative', () => {
    expect(freePointsAvailable({ level: 1, freePointsFromEvents: 1, allocatedPoints: 9 })).toBe(0);
  });

  it('spends down to exactly zero', () => {
    expect(freePointsAvailable({ level: 3, freePointsFromEvents: 1, allocatedPoints: 7 })).toBe(0);
  });
});

describe('canAllocate', () => {
  it('accepts a whole number of points within budget (ADR-5)', () => {
    expect(canAllocate(1, 3)).toBe(true);
    expect(canAllocate(3, 3)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(canAllocate(0, 3)).toBe(false);
    expect(canAllocate(-1, 3)).toBe(false);
    expect(canAllocate(1.5, 3)).toBe(false);
    expect(canAllocate(4, 3)).toBe(false);
    expect(canAllocate(1, 0)).toBe(false);
  });
});
