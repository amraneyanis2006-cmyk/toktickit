import type { Prisma } from '@prisma/client';

// Shared Prisma includes and JSON shapes for Actions Taken and Status History
// (api-spec.md sec 0), used by the Actions Taken router and by both Ticket
// Detail endpoints so every response has exactly the same objects and order.

const userRef = { select: { id: true, name: true } } as const;

export const ACTION_TAKEN_INCLUDE = {
  performedBy: userRef,
  createdBy: userRef,
  ticket: { select: { ticketNumber: true } },
} satisfies Prisma.ActionTakenInclude;

/** BR-19: actionAt ascending, then id ascending. */
export const ACTION_TAKEN_ORDER: Prisma.ActionTakenOrderByWithRelationInput[] = [{ actionAt: 'asc' }, { id: 'asc' }];

/** BR-19: changedAt ascending, then id ascending. */
export const STATUS_CHANGE_ORDER: Prisma.TicketStatusChangeOrderByWithRelationInput[] = [{ changedAt: 'asc' }, { id: 'asc' }];

export const TICKET_HISTORY_INCLUDE = {
  actionsTaken: { orderBy: ACTION_TAKEN_ORDER, include: ACTION_TAKEN_INCLUDE },
  statusChanges: { orderBy: STATUS_CHANGE_ORDER, include: { changedBy: userRef } },
} satisfies Prisma.TicketInclude;

type ActionTakenRow = Prisma.ActionTakenGetPayload<{ include: typeof ACTION_TAKEN_INCLUDE }>;
type StatusChangeRow = Prisma.TicketStatusChangeGetPayload<{ include: { changedBy: typeof userRef } }>;

/** The ActionTaken object of api-spec.md sec 0. clientRequestId is never returned. */
export function toActionTaken(a: ActionTakenRow) {
  return {
    id: a.id,
    ticketNumber: a.ticket.ticketNumber,
    actionAt: a.actionAt,
    description: a.description,
    result: a.result,
    status: a.status,
    performedBy: { id: a.performedBy.id, name: a.performedBy.name },
    createdBy: { id: a.createdBy.id, name: a.createdBy.name },
    followUpRequired: a.followUpRequired,
    followUpNote: a.followUpNote,
    attachmentNotes: a.attachmentNotes,
    completedAt: a.completedAt,
    cancelledAt: a.cancelledAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

/** The StatusChange object of api-spec.md sec 0. */
export function toStatusChange(c: StatusChangeRow) {
  return {
    id: c.id,
    fromStatus: c.fromStatus,
    toStatus: c.toStatus,
    changedBy: { id: c.changedBy.id, name: c.changedBy.name },
    changedAt: c.changedAt,
  };
}
