import { describe, it, expect } from 'vitest';
import { ACTIVE_STATUSES, OPEN_ACTION_STATUSES, recentWindowStart, RECENT_WINDOW_DAYS } from '../../../src/utils/dashboard';

describe('Dashboard constants and window (BR-22, BR-23)', () => {
  it('UNIT-04: active statuses are exactly the five BR-22 values and open actions PLANNED/IN_PROGRESS', () => {
    expect([...ACTIVE_STATUSES].sort()).toEqual(['IN_PROGRESS', 'NEW', 'OPEN', 'REOPENED', 'WAITING_FOR_REQUESTER']);
    expect([...OPEN_ACTION_STATUSES].sort()).toEqual(['IN_PROGRESS', 'PLANNED']);
  });

  it('UNIT-04: the recent window starts exactly 7 x 24 h before now, independent of the time zone', () => {
    expect(RECENT_WINDOW_DAYS).toBe(7);
    const now = new Date('2026-03-29T01:30:00.000Z'); // a DST switch day in Europe
    expect(recentWindowStart(now).toISOString()).toBe('2026-03-22T01:30:00.000Z');
    expect(now.getTime() - recentWindowStart(now).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    const original = process.env.TZ;
    process.env.TZ = 'Asia/Bangkok';
    try {
      expect(recentWindowStart(now).toISOString()).toBe('2026-03-22T01:30:00.000Z');
    } finally {
      process.env.TZ = original;
    }
  });
});
