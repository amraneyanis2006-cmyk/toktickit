// Mirrors server/src/utils/statusTransition.ts (specification.md sec 4.7).
// Client-side copy so the Status select can render ONLY legal next options,
// not just disable illegal ones (ui-spec.md sec 8).

export type TicketStatus =
  | 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_REQUESTER'
  | 'RESOLVED' | 'CLOSED' | 'REOPENED' | 'CANCELLED';

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
  CANCELLED: [],
};

export function legalNextStatuses(from: TicketStatus): TicketStatus[] {
  return TRANSITIONS[from] ?? [];
}
