import { Router } from 'express';
import type { Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAuth, requirePasswordChanged, requireRole } from '../middleware/auth';
import { isActiveTicketStatus } from '../utils/statusTransition';
import type { TicketStatus } from '../utils/statusTransition';
import { ACTION_STATUSES, isLockedActionStatus, isValidActionTransition } from '../utils/actionTransition';
import type { ActionStatus } from '../utils/actionTransition';
import { ACTION_LIMITS, parseIsoDateTime, validateActionFields } from '../utils/actionValidation';
import type { ActionFieldErrors } from '../utils/actionValidation';
import { ACTION_TAKEN_INCLUDE, ACTION_TAKEN_ORDER, toActionTaken } from '../utils/ticketHistory';

// Actions Taken (docs/lab-04/api-spec.md sec 3-6, specification.md BR-01..BR-10,
// BR-17..BR-19). IT Staff and Administrators only; there is deliberately no
// DELETE route (append-only, BR-09).

const router = Router();
const prisma = new PrismaClient();

const staffOnly = [requireAuth, requirePasswordChanged, requireRole('IT_STAFF', 'ADMINISTRATOR')];

function notFound(res: Response, what = 'Ticket') {
  return res.status(404).json({ error: 'NOT_FOUND', message: `${what} not found.` });
}

function validationError(res: Response, fields: ActionFieldErrors) {
  return res.status(400).json({
    error: 'VALIDATION_ERROR',
    message: 'Some fields are invalid. Check the highlighted fields and try again.',
    fields,
  });
}

function ticketNotActive(res: Response) {
  return res.status(409).json({
    error: 'TICKET_NOT_ACTIVE',
    message: 'Actions can only be recorded on an active ticket. Reopen it first.',
  });
}

function findTicket(ticketNumber: string) {
  return prisma.ticket.findUnique({
    where: { ticketNumber },
    select: { id: true, ticketNumber: true, currentStatus: true, createdAt: true },
  });
}

/** The action only if it belongs to this ticket; non-numeric ids are simply not found. */
async function findAction(ticketId: number, rawId: string) {
  if (!/^\d{1,9}$/.test(rawId)) return null;
  return prisma.actionTaken.findFirst({ where: { id: Number(rawId), ticketId }, include: ACTION_TAKEN_INCLUDE });
}

/** BR-05: Performed by must be an active IT Staff member or Administrator. */
async function isValidAssignee(userId: number) {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true, role: { in: ['IT_STAFF', 'ADMINISTRATOR'] } },
    select: { id: true },
  });
  return user !== null;
}

function invalidAssignee(res: Response) {
  return res.status(422).json({
    error: 'INVALID_ASSIGNEE',
    message: "This person can't be assigned (inactive or not IT Staff).",
  });
}

/** expectedUpdatedAt is mandatory on every Action Taken update (BR-17). */
function readExpectedUpdatedAt(body: Record<string, unknown>, fields: ActionFieldErrors): Date | null {
  const expected = parseIsoDateTime(body.expectedUpdatedAt);
  if (!expected) fields.expectedUpdatedAt = 'expectedUpdatedAt is required (the updatedAt you last loaded).';
  return expected;
}

async function staleUpdate(res: Response, actionId: number) {
  const current = await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId }, include: ACTION_TAKEN_INCLUDE });
  return res.status(409).json({
    error: 'STALE_UPDATE',
    message: 'Someone else updated this action. The latest version is shown.',
    current: toActionTaken(current),
  });
}

/**
 * Conditional update on the updatedAt the client last saw (BR-17): if another
 * request changed the row in between, 0 rows match and nothing is written.
 */
async function updateIfUnchanged(actionId: number, expected: Date, data: Prisma.ActionTakenUncheckedUpdateManyInput) {
  const { count } = await prisma.actionTaken.updateMany({
    where: { id: actionId, updatedAt: expected },
    // Strictly later than the token, even within the same millisecond, so an
    // old token can never match the new version.
    data: { ...data, updatedAt: new Date(Math.max(Date.now(), expected.getTime() + 1)) },
  });
  return count === 1;
}

function bodyOf(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
}

// --------------------------------------------------
// GET /api/staff/tickets/:ticketNumber/actions (api-spec sec 3)
// --------------------------------------------------
router.get('/staff/tickets/:ticketNumber/actions', ...staffOnly, async (req: Request, res: Response) => {
  try {
    const ticket = await findTicket(req.params.ticketNumber as string);
    if (!ticket) return notFound(res);

    const actions = await prisma.actionTaken.findMany({
      where: { ticketId: ticket.id },
      orderBy: ACTION_TAKEN_ORDER,
      include: ACTION_TAKEN_INCLUDE,
    });
    res.status(200).json({ data: actions.map(toActionTaken) });
  } catch (error) {
    console.error('Error listing actions taken:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unable to load actions.' });
  }
});

// --------------------------------------------------
// POST /api/staff/tickets/:ticketNumber/actions (api-spec sec 4)
// createdById and ticketId are never read from the body (BR-01, BR-04).
// --------------------------------------------------
router.post('/staff/tickets/:ticketNumber/actions', ...staffOnly, async (req: Request, res: Response) => {
  try {
    const ticket = await findTicket(req.params.ticketNumber as string);
    if (!ticket) return notFound(res);

    const body = bodyOf(req);
    const { fields, data } = validateActionFields(body, { mode: 'create', ticketCreatedAt: ticket.createdAt });
    if (Object.keys(fields).length > 0) return validationError(res, fields);

    const clientRequestId = typeof body.clientRequestId === 'string' ? body.clientRequestId.toLowerCase() : null;
    const findReplay = () =>
      clientRequestId
        ? prisma.actionTaken.findUnique({
            where: { ticketId_clientRequestId: { ticketId: ticket.id, clientRequestId } },
            include: ACTION_TAKEN_INCLUDE,
          })
        : Promise.resolve(null);

    // BR-18: a retry of an already-processed request returns the original action.
    const replay = await findReplay();
    if (replay) return res.status(200).json(toActionTaken(replay));

    if (!isActiveTicketStatus(ticket.currentStatus as TicketStatus)) return ticketNotActive(res);

    const performedById = typeof body.performedById === 'number' ? body.performedById : req.user!.id;
    if (!(await isValidAssignee(performedById))) return invalidAssignee(res);

    try {
      const created = await prisma.actionTaken.create({
        data: {
          ticketId: ticket.id,
          createdById: req.user!.id,
          performedById,
          clientRequestId,
          status: 'PLANNED',
          actionAt: data.actionAt!,
          description: data.description!,
          result: data.result ?? null,
          followUpRequired: data.followUpRequired ?? false,
          followUpNote: data.followUpNote ?? null,
          attachmentNotes: data.attachmentNotes ?? null,
        },
        include: ACTION_TAKEN_INCLUDE,
      });
      return res.status(201).json(toActionTaken(created));
    } catch (error) {
      // Two parallel requests with the same key: the unique index lets only
      // one insert through; the other returns the row that won (BR-18).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await findReplay();
        if (winner) return res.status(200).json(toActionTaken(winner));
      }
      throw error;
    }
  } catch (error) {
    console.error('Error creating action taken:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unable to save the action.' });
  }
});

// --------------------------------------------------
// PATCH /api/staff/tickets/:ticketNumber/actions/:actionId (api-spec sec 5)
// Partial edit / re-assign of an OPEN action.
// --------------------------------------------------
router.patch('/staff/tickets/:ticketNumber/actions/:actionId', ...staffOnly, async (req: Request, res: Response) => {
  try {
    const ticket = await findTicket(req.params.ticketNumber as string);
    if (!ticket) return notFound(res);
    const action = await findAction(ticket.id, req.params.actionId as string);
    if (!action) return notFound(res, 'Action');

    const body = bodyOf(req);
    const { fields, data } = validateActionFields(body, {
      mode: 'update',
      ticketCreatedAt: ticket.createdAt,
      current: { followUpRequired: action.followUpRequired, followUpNote: action.followUpNote },
    });
    const expected = readExpectedUpdatedAt(body, fields);
    if (Object.keys(fields).length > 0 || !expected) return validationError(res, fields);

    if (isLockedActionStatus(action.status as ActionStatus)) {
      return res.status(409).json({
        error: 'ACTION_LOCKED',
        message: 'Completed and cancelled actions cannot be changed. Record a new action instead.',
      });
    }
    if (!isActiveTicketStatus(ticket.currentStatus as TicketStatus)) return ticketNotActive(res);
    if (expected.getTime() !== action.updatedAt.getTime()) return staleUpdate(res, action.id);

    const performedById = typeof body.performedById === 'number' ? body.performedById : undefined;
    if (performedById !== undefined && !(await isValidAssignee(performedById))) return invalidAssignee(res);

    const updated = await updateIfUnchanged(action.id, expected, {
      ...data,
      ...(performedById !== undefined ? { performedById } : {}),
    });
    if (!updated) return staleUpdate(res, action.id);

    const fresh = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id }, include: ACTION_TAKEN_INCLUDE });
    res.status(200).json(toActionTaken(fresh));
  } catch (error) {
    console.error('Error updating action taken:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unable to save the action.' });
  }
});

// --------------------------------------------------
// PATCH /api/staff/tickets/:ticketNumber/actions/:actionId/status (api-spec sec 6)
// Start / complete (needs a Result) / cancel.
// --------------------------------------------------
router.patch('/staff/tickets/:ticketNumber/actions/:actionId/status', ...staffOnly, async (req: Request, res: Response) => {
  try {
    const ticket = await findTicket(req.params.ticketNumber as string);
    if (!ticket) return notFound(res);
    const action = await findAction(ticket.id, req.params.actionId as string);
    if (!action) return notFound(res, 'Action');

    const body = bodyOf(req);
    const fields: ActionFieldErrors = {};
    const target = body.status as ActionStatus;
    if (!ACTION_STATUSES.includes(target)) fields.status = 'status must be PLANNED, IN_PROGRESS, COMPLETED, or CANCELLED.';

    let suppliedResult: string | null | undefined;
    if (body.result !== undefined && body.result !== null) {
      if (typeof body.result !== 'string') fields.result = 'Result must be text.';
      else if (body.result.trim().length > ACTION_LIMITS.result) fields.result = `Result must not exceed ${ACTION_LIMITS.result} characters.`;
      else suppliedResult = body.result.trim() || null;
    }
    const expected = readExpectedUpdatedAt(body, fields);
    if (Object.keys(fields).length > 0 || !expected) return validationError(res, fields);

    if (!isActiveTicketStatus(ticket.currentStatus as TicketStatus)) return ticketNotActive(res);
    if (expected.getTime() !== action.updatedAt.getTime()) return staleUpdate(res, action.id);

    const from = action.status as ActionStatus;
    if (!isValidActionTransition(from, target)) {
      return res.status(409).json({
        error: 'INVALID_ACTION_TRANSITION',
        message: `An action cannot move from ${from} to ${target}.`,
      });
    }

    const result = suppliedResult ?? action.result;
    if (target === 'COMPLETED' && !result) {
      return validationError(res, { result: 'A Result is required to complete an action.' });
    }

    const now = new Date();
    const updated = await updateIfUnchanged(action.id, expected, {
      status: target,
      ...(suppliedResult !== undefined ? { result: suppliedResult } : {}),
      ...(target === 'COMPLETED' ? { completedAt: now } : {}),
      ...(target === 'CANCELLED' ? { cancelledAt: now } : {}),
    });
    if (!updated) return staleUpdate(res, action.id);

    const fresh = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id }, include: ACTION_TAKEN_INCLUDE });
    res.status(200).json(toActionTaken(fresh));
  } catch (error) {
    console.error('Error changing action status:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unable to update the action.' });
  }
});

// --------------------------------------------------
// No DELETE (append-only, BR-09, api-spec sec 12): answer 404 NOT_FOUND in the
// standard error shape rather than Express's default HTML page.
// --------------------------------------------------
router.delete(
  ['/staff/tickets/:ticketNumber/actions', '/staff/tickets/:ticketNumber/actions/:actionId', '/staff/tickets/:ticketNumber/actions/:actionId/status'],
  (req: Request, res: Response) => res.status(404).json({ error: 'NOT_FOUND', message: 'Not found.' })
);

export default router;
