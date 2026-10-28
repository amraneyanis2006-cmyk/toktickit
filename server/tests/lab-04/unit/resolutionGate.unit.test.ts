import { describe, it, expect } from 'vitest';
import { computeResolutionGate } from '../../../src/utils/resolutionGate';
import type { ActionStatus } from '../../../src/utils/actionTransition';

const owned = { ticketOwnerId: 7 };
const unowned = { ticketOwnerId: null };
const actions = (...statuses: ActionStatus[]) => statuses.map((status) => ({ status }));

describe('computeResolutionGate (BR-12)', () => {
  it('UNIT-02: an owned ticket with a completed action and no open action can be resolved', () => {
    expect(computeResolutionGate(owned, actions('COMPLETED'))).toEqual({ canResolve: true, blockers: [] });
    // Cancelled actions neither count as completed work nor block.
    expect(computeResolutionGate(owned, actions('COMPLETED', 'CANCELLED'))).toEqual({ canResolve: true, blockers: [] });
  });

  it('UNIT-02: UNASSIGNED applies exactly when there is no Ticket Owner', () => {
    expect(computeResolutionGate(unowned, actions('COMPLETED'))).toEqual({ canResolve: false, blockers: ['UNASSIGNED'] });
  });

  it('UNIT-02: NO_COMPLETED_ACTION applies when no action is COMPLETED (none, or only cancelled)', () => {
    expect(computeResolutionGate(owned, [])).toEqual({ canResolve: false, blockers: ['NO_COMPLETED_ACTION'] });
    expect(computeResolutionGate(owned, actions('CANCELLED'))).toEqual({ canResolve: false, blockers: ['NO_COMPLETED_ACTION'] });
  });

  it('UNIT-02: OPEN_ACTIONS applies when any action is PLANNED or IN_PROGRESS', () => {
    expect(computeResolutionGate(owned, actions('COMPLETED', 'PLANNED'))).toEqual({ canResolve: false, blockers: ['OPEN_ACTIONS'] });
    expect(computeResolutionGate(owned, actions('IN_PROGRESS', 'COMPLETED'))).toEqual({ canResolve: false, blockers: ['OPEN_ACTIONS'] });
  });

  it('UNIT-02: lists every blocker that applies, in a stable order', () => {
    expect(computeResolutionGate(unowned, actions('PLANNED'))).toEqual({
      canResolve: false,
      blockers: ['UNASSIGNED', 'NO_COMPLETED_ACTION', 'OPEN_ACTIONS'],
    });
    expect(computeResolutionGate(owned, actions('IN_PROGRESS', 'CANCELLED'))).toEqual({
      canResolve: false,
      blockers: ['NO_COMPLETED_ACTION', 'OPEN_ACTIONS'],
    });
  });
});
