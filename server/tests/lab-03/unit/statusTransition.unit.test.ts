import { describe, it, expect } from 'vitest';
import { isValidTransition, legalNextStatuses } from '../../../src/utils/statusTransition';
import type { TicketStatus } from '../../../src/utils/statusTransition';

const ALL_STATUSES: TicketStatus[] = [
  'NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED',
];

const VALID_PAIRS: [TicketStatus, TicketStatus][] = [
  ['NEW', 'OPEN'], ['NEW', 'IN_PROGRESS'], ['NEW', 'CANCELLED'],
  ['OPEN', 'IN_PROGRESS'], ['OPEN', 'CANCELLED'],
  ['IN_PROGRESS', 'WAITING_FOR_REQUESTER'], ['IN_PROGRESS', 'RESOLVED'], ['IN_PROGRESS', 'CANCELLED'],
  ['WAITING_FOR_REQUESTER', 'IN_PROGRESS'], ['WAITING_FOR_REQUESTER', 'RESOLVED'], ['WAITING_FOR_REQUESTER', 'CANCELLED'],
  ['RESOLVED', 'CLOSED'], ['RESOLVED', 'REOPENED'],
  ['CLOSED', 'REOPENED'],
  ['REOPENED', 'IN_PROGRESS'], ['REOPENED', 'WAITING_FOR_REQUESTER'], ['REOPENED', 'CANCELLED'],
];

describe('status transition matrix (UNIT-02)', () => {
  it('returns true only for every listed pair (sec 4.7)', () => {
    for (const [from, to] of VALID_PAIRS) {
      expect(isValidTransition(from, to)).toBe(true);
    }
  });

  it('returns false for every unlisted pair, including all self-transitions', () => {
    const validSet = new Set(VALID_PAIRS.map(([f, t]) => `${f}->${t}`));
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (!validSet.has(`${from}->${to}`)) {
          expect(isValidTransition(from, to)).toBe(false);
        }
      }
    }
  });

  it('CANCELLED is terminal - no legal next status', () => {
    expect(legalNextStatuses('CANCELLED')).toEqual([]);
  });

  it('legalNextStatuses matches isValidTransition for every status', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        expect(legalNextStatuses(from).includes(to)).toBe(isValidTransition(from, to));
      }
    }
  });
});
