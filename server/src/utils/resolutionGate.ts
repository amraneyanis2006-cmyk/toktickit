import { isOpenActionStatus } from './actionTransition';
import type { ActionStatus } from './actionTransition';

// Resolution gate (specification.md BR-12). One pure function, used by the
// status endpoint AND the staff Ticket Detail response, so the UI hint and the
// server decision can never disagree (api-spec.md sec 0 ResolutionGate).

export type ResolutionBlocker = 'UNASSIGNED' | 'NO_COMPLETED_ACTION' | 'OPEN_ACTIONS';

export interface ResolutionGate {
  canResolve: boolean;
  blockers: ResolutionBlocker[];
}

/** Every blocker that applies, always in the order UNASSIGNED, NO_COMPLETED_ACTION, OPEN_ACTIONS. */
export function computeResolutionGate(
  ticket: { ticketOwnerId: number | null },
  actions: ReadonlyArray<{ status: ActionStatus }>
): ResolutionGate {
  const blockers: ResolutionBlocker[] = [];
  if (ticket.ticketOwnerId === null) blockers.push('UNASSIGNED');
  if (!actions.some((a) => a.status === 'COMPLETED')) blockers.push('NO_COMPLETED_ACTION');
  if (actions.some((a) => isOpenActionStatus(a.status))) blockers.push('OPEN_ACTIONS');
  return { canResolve: blockers.length === 0, blockers };
}
