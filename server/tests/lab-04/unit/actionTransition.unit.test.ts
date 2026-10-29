import { describe, it, expect } from 'vitest';
import {
  ACTION_STATUSES,
  isValidActionTransition,
  isOpenActionStatus,
  isLockedActionStatus,
} from '../../../src/utils/actionTransition';
import type { ActionStatus } from '../../../src/utils/actionTransition';

// BR-08: the complete set of legal Action Taken transitions.
const LEGAL: Array<[ActionStatus, ActionStatus]> = [
  ['PLANNED', 'IN_PROGRESS'],
  ['PLANNED', 'COMPLETED'],
  ['PLANNED', 'CANCELLED'],
  ['IN_PROGRESS', 'COMPLETED'],
  ['IN_PROGRESS', 'CANCELLED'],
];

describe('Action Taken status transitions (BR-08)', () => {
  it('UNIT-01: allows exactly the BR-08 transitions and rejects every other pair', () => {
    for (const from of ACTION_STATUSES) {
      for (const to of ACTION_STATUSES) {
        const expected = LEGAL.some(([f, t]) => f === from && t === to);
        expect(isValidActionTransition(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it('UNIT-01: COMPLETED and CANCELLED are terminal (no exit) and locked', () => {
    for (const terminal of ['COMPLETED', 'CANCELLED'] as const) {
      for (const to of ACTION_STATUSES) {
        expect(isValidActionTransition(terminal, to)).toBe(false);
      }
      expect(isLockedActionStatus(terminal)).toBe(true);
      expect(isOpenActionStatus(terminal)).toBe(false);
    }
  });

  it('UNIT-01: PLANNED and IN_PROGRESS are the open statuses', () => {
    expect(isOpenActionStatus('PLANNED')).toBe(true);
    expect(isOpenActionStatus('IN_PROGRESS')).toBe(true);
    expect(isLockedActionStatus('PLANNED')).toBe(false);
    expect(isLockedActionStatus('IN_PROGRESS')).toBe(false);
  });

  it('UNIT-01: unknown values are never a valid transition', () => {
    expect(isValidActionTransition('PLANNED', 'DONE' as ActionStatus)).toBe(false);
    expect(isValidActionTransition('DONE' as ActionStatus, 'COMPLETED')).toBe(false);
  });
});
