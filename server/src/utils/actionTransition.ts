// Action Taken status transitions (specification.md BR-08). Pure lookup, like
// statusTransition.ts for Tickets, so it is testable without DB/HTTP (UNIT-01).

export type ActionStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export const ACTION_STATUSES: readonly ActionStatus[] = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

const TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  PLANNED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** True only for the BR-08 pairs; COMPLETED and CANCELLED are terminal. */
export function isValidActionTransition(from: ActionStatus, to: ActionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Open Actions (BR-22): the ones that still block resolution and can be edited. */
export const OPEN_ACTION_STATUSES: readonly ActionStatus[] = ['PLANNED', 'IN_PROGRESS'];

export function isOpenActionStatus(status: ActionStatus): boolean {
  return OPEN_ACTION_STATUSES.includes(status);
}

/** Completed/cancelled actions are immutable (BR-09, 409 ACTION_LOCKED). */
export function isLockedActionStatus(status: ActionStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}
