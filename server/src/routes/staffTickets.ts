import { Router } from 'express';
import type { Request, Response } from 'express';
import { PrismaClient, TicketStatus as TicketStatusEnum } from '@prisma/client';
import { requireAuth, requirePasswordChanged, requireRole } from '../middleware/auth';
import { normalizePagination, validateCommentContent } from '../utils/validation';
import { isValidTransition, legalNextStatuses } from '../utils/statusTransition';
import type { TicketStatus } from '../utils/statusTransition';
import { TICKET_HISTORY_INCLUDE, toActionTaken, toStatusChange } from '../utils/ticketHistory';
import { computeResolutionGate } from '../utils/resolutionGate';
import { parseIsoDateTime } from '../utils/actionValidation';
import { LOCKING_TX_OPTIONS } from '../utils/transactions';
import { OPEN_ACTION_STATUSES } from '../utils/actionTransition';

const router = Router();
const prisma = new PrismaClient();

// --------------------------------------------------
// GET /api/staff/tickets - IT Staff Ticket Queue across all Requesters
// (api-spec.md sec 8, BR-17, BR-18)
// --------------------------------------------------
router.get(
  '/staff/tickets',
  requireAuth,
  requirePasswordChanged,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response) => {
    try {
      const { page, pageSize } = normalizePagination({
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      const skip = (page - 1) * pageSize;

      const allowedSortFields = ['createdAt', 'ticketNumber', 'updatedAt'];
      let sortBy = req.query.sortBy as string;
      if (!allowedSortFields.includes(sortBy)) sortBy = 'createdAt';

      let sortDir = req.query.sortDir as string;
      if (sortDir !== 'asc' && sortDir !== 'desc') sortDir = 'desc';

      const search = (req.query.search as string) || '';
      const status = (req.query.status as string) || undefined;
      const itPriority = (req.query.priority as string) || undefined; // BR-18: filters itPriority, not requestedPriority
      const ownership = (req.query.ownership as string) || 'all';

      const where: any = {};

      if (search.trim()) {
        where.OR = [
          { ticketNumber: { contains: search, mode: 'insensitive' } },
          { summary: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (status) where.currentStatus = status;
      if (itPriority) where.itPriority = itPriority;

      if (ownership === 'mine') {
        where.ticketOwnerId = req.user!.id;
      } else if (ownership === 'unassigned') {
        where.ticketOwnerId = null;
      }
      // 'all' (default): no ownership filter at all (BR-17 - no ownership scoping for staff)

      const [tickets, totalItems] = await Promise.all([
        prisma.ticket.findMany({
          where,
          orderBy: { [sortBy]: sortDir },
          skip,
          take: pageSize,
          select: {
            id: true,
            ticketNumber: true,
            summary: true,
            requestedPriority: true,
            itPriority: true,
            currentStatus: true,
            createdAt: true,
            updatedAt: true,
            category: { select: { name: true } },
            ticketOwner: { select: { id: true, name: true } },
          },
        }),
        prisma.ticket.count({ where }),
      ]);

      const data = tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        summary: t.summary,
        categoryName: t.category.name,
        requestedPriority: t.requestedPriority,
        itPriority: t.itPriority,
        currentStatus: t.currentStatus,
        ticketOwner: t.ticketOwner ? { id: t.ticketOwner.id, name: t.ticketOwner.name } : null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));

      res.status(200).json({
        data,
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      });
    } catch (error) {
      console.error('Error fetching staff ticket queue:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Unable to load tickets.',
      });
    }
  }
);

// --------------------------------------------------
// GET /api/staff/users - active IT Staff/Administrator users, for the
// Claim/Reassign dropdown. Not in the original api-spec.md - GET /api/admin/users
// is Administrator-only, but any IT Staff member needs this list to reassign
// a ticket to a colleague. Minimal shape (id, name only - no email needed here).
// --------------------------------------------------
router.get(
  '/staff/users',
  requireAuth,
  requirePasswordChanged,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response) => {
    try {
      const users = await prisma.user.findMany({
        where: { isActive: true, role: { in: ['IT_STAFF', 'ADMINISTRATOR'] } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      res.status(200).json(users);
    } catch (error) {
      console.error('Error fetching staff users:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unable to load users.' });
    }
  }
);

// --------------------------------------------------
// GET /api/staff/tickets/:ticketNumber - full detail for staff, including
// Attachments, Public Comments, and Internal Notes (api-spec.md sec 9).
// No ownership restriction: any IT Staff/Administrator may view any ticket.
// --------------------------------------------------
router.get(
  '/staff/tickets/:ticketNumber',
  requireAuth,
  requirePasswordChanged,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response) => {
    try {
      const { ticketNumber } = req.params;

      const ticket = await prisma.ticket.findFirst({
        where: { ticketNumber: ticketNumber as string },
        include: {
          requester: { select: { id: true, name: true, email: true } },
          ticketOwner: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          relatedSystem: { select: { id: true, name: true } },
          attachments: { orderBy: { uploadedAt: 'desc' } },
          publicComments: {
            orderBy: { createdAt: 'asc' },
            include: { author: { select: { id: true, name: true, role: true } } },
          },
          internalNotes: {
            orderBy: { createdAt: 'asc' },
            include: { author: { select: { id: true, name: true } } },
          },
          ...TICKET_HISTORY_INCLUDE,
        },
      });

      if (!ticket) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Ticket not found.' });
      }

      res.status(200).json({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        requester: ticket.requester,
        ticketOwner: ticket.ticketOwner,
        category: ticket.category,
        relatedSystem: ticket.relatedSystem,
        summary: ticket.summary,
        description: ticket.description,
        requestedPriority: ticket.requestedPriority,
        itPriority: ticket.itPriority,
        currentStatus: ticket.currentStatus,
        requesterIndicatedResolved: ticket.requesterIndicatedResolved,
        resolvedAt: ticket.resolvedAt,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        attachments: ticket.attachments.map((a) => ({
          id: a.id,
          originalFileName: a.originalFileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          uploadedAt: a.uploadedAt,
          isRemoved: a.isRemoved,
          ...(a.isRemoved && { removedAt: a.removedAt, removalReason: a.removalReason }),
        })),
        publicComments: ticket.publicComments.map((c) => ({
          id: c.id,
          ticketId: c.ticketId,
          authorId: c.author.id,
          authorName: c.author.name,
          authorRole: c.author.role,
          content: c.content,
          createdAt: c.createdAt,
        })),
        internalNotes: ticket.internalNotes.map((n) => ({
          id: n.id,
          ticketId: n.ticketId,
          authorId: n.author.id,
          authorName: n.author.name,
          content: n.content,
          createdAt: n.createdAt,
        })),
        actionsTaken: ticket.actionsTaken.map(toActionTaken),
        statusHistory: ticket.statusChanges.map(toStatusChange),
        resolutionGate: computeResolutionGate(ticket, ticket.actionsTaken),
        legalNextStatuses: legalNextStatuses(ticket.currentStatus as TicketStatus),
      });
    } catch (error) {
      console.error('Error fetching staff ticket detail:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unable to load ticket.' });
    }
  }
);

// --------------------------------------------------
// PATCH /api/staff/tickets/:ticketNumber/claim - claim (self) or reassign
// (api-spec.md sec 10, BR-11, BR-12). expectedUpdatedAt is optional and, when
// provided, enforces optimistic concurrency (409 OWNERSHIP_CHANGED) - the
// client sends back the updatedAt it last saw for this ticket.
// --------------------------------------------------
router.patch(
  '/staff/tickets/:ticketNumber/claim',
  requireAuth,
  requirePasswordChanged,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response) => {
    try {
      const { ticketNumber } = req.params;
      const { ticketOwnerId, expectedUpdatedAt } = req.body ?? {};

      if (ticketOwnerId === undefined || ticketOwnerId === null || typeof ticketOwnerId !== 'number') {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'ticketOwnerId is required.',
        });
      }

      const ticket = await prisma.ticket.findFirst({ where: { ticketNumber: ticketNumber as string } });
      if (!ticket) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Ticket not found.' });
      }

      if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== ticket.updatedAt.getTime()) {
        return res.status(409).json({
          error: 'OWNERSHIP_CHANGED',
          message: 'This ticket was changed by someone else. Refresh and try again.',
        });
      }

      const targetUser = await prisma.user.findFirst({
        where: { id: ticketOwnerId, isActive: true, role: { in: ['IT_STAFF', 'ADMINISTRATOR'] } },
      });
      if (!targetUser) {
        return res.status(422).json({
          error: 'INVALID_OWNER',
          message: 'The selected owner must be an active IT Staff or Administrator user.',
        });
      }

      const updated = await prisma.ticket.update({
        where: { id: ticket.id },
        data: { ticketOwnerId: targetUser.id },
      });

      res.status(200).json({
        ticketNumber: updated.ticketNumber,
        ticketOwner: { id: targetUser.id, name: targetUser.name },
      });
    } catch (error) {
      console.error('Error claiming/reassigning ticket:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unable to update ticket owner.' });
    }
  }
);

// --------------------------------------------------
// PATCH /api/staff/tickets/:ticketNumber/priority - set IT Priority (sec 11, BR-13).
// --------------------------------------------------
router.patch(
  '/staff/tickets/:ticketNumber/priority',
  requireAuth,
  requirePasswordChanged,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response) => {
    try {
      const { ticketNumber } = req.params;
      const { itPriority } = req.body ?? {};

      if (!['LOW', 'MEDIUM', 'HIGH'].includes(itPriority)) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'itPriority must be LOW, MEDIUM, or HIGH.',
        });
      }

      const ticket = await prisma.ticket.findFirst({ where: { ticketNumber: ticketNumber as string } });
      if (!ticket) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Ticket not found.' });
      }

      const updated = await prisma.ticket.update({
        where: { id: ticket.id },
        data: { itPriority },
      });

      res.status(200).json({ ticketNumber: updated.ticketNumber, itPriority: updated.itPriority });
    } catch (error) {
      console.error('Error setting IT priority:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unable to update priority.' });
    }
  }
);

// --------------------------------------------------
// PATCH /api/staff/tickets/:ticketNumber/status - change Current Status
// (Lab 4 api-spec.md sec 8, BR-11..BR-17). Processing order is binding:
// validate -> 404 -> stale check (optional expectedUpdatedAt) -> matrix ->
// UNASSIGNED_TICKET -> one transaction: lock the ticket row, re-check status,
// token and owner on the locked row, resolution gate, conditional update
// (0 rows -> STALE_UPDATE), append one TicketStatusChange.
// --------------------------------------------------
const VALID_STATUSES = Object.values(TicketStatusEnum) as TicketStatus[];

/** Thrown inside the transaction when another request changed the status first. */
class StaleStatusError extends Error {}

function statusSummary(t: {
  ticketNumber: string;
  currentStatus: string;
  requesterIndicatedResolved: boolean;
  resolvedAt: Date | null;
  updatedAt: Date;
}) {
  return {
    ticketNumber: t.ticketNumber,
    currentStatus: t.currentStatus,
    requesterIndicatedResolved: t.requesterIndicatedResolved,
    resolvedAt: t.resolvedAt,
    updatedAt: t.updatedAt,
    legalNextStatuses: legalNextStatuses(t.currentStatus as TicketStatus),
  };
}

async function staleStatus(res: Response, ticketId: number) {
  const current = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  return res.status(409).json({
    error: 'STALE_UPDATE',
    message: 'This ticket was changed by someone else. The latest status is shown.',
    current: statusSummary(current),
  });
}

function unassignedTicket(res: Response) {
  return res.status(409).json({
    error: 'UNASSIGNED_TICKET',
    message: 'An unassigned ticket cannot be resolved or closed.',
  });
}

const BLOCKER_MESSAGES: Record<string, string> = {
  NO_COMPLETED_ACTION: 'complete at least one action',
  OPEN_ACTIONS: 'complete or cancel the open actions',
};

router.patch(
  '/staff/tickets/:ticketNumber/status',
  requireAuth,
  requirePasswordChanged,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response) => {
    try {
      const { ticketNumber } = req.params;
      const requested = req.body?.currentStatus;
      const rawExpected = req.body?.expectedUpdatedAt;

      const fields: Record<string, string> = {};
      if (typeof requested !== 'string' || !VALID_STATUSES.includes(requested as TicketStatus)) {
        fields.currentStatus = 'currentStatus must be a valid status value.';
      }
      // Optional for Lab 3 compatibility; when sent it must be a valid timestamp.
      const expected = rawExpected === undefined || rawExpected === null ? null : parseIsoDateTime(rawExpected);
      if (rawExpected !== undefined && rawExpected !== null && !expected) {
        fields.expectedUpdatedAt = 'expectedUpdatedAt must be an ISO-8601 date-time with a time zone.';
      }
      if (Object.keys(fields).length > 0) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: fields.currentStatus ?? fields.expectedUpdatedAt,
          fields,
        });
      }
      const target = requested as TicketStatus;

      const ticket = await prisma.ticket.findFirst({ where: { ticketNumber: ticketNumber as string } });
      if (!ticket) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Ticket not found.' });
      }

      if (expected && expected.getTime() !== ticket.updatedAt.getTime()) return await staleStatus(res, ticket.id);

      const current = ticket.currentStatus as TicketStatus;

      if (!isValidTransition(current, target)) {
        return res.status(409).json({
          error: 'INVALID_TRANSITION',
          message: `Cannot move from ${current} to ${target}.`,
        });
      }

      if ((target === 'RESOLVED' || target === 'CLOSED') && ticket.ticketOwnerId === null) return unassignedTicket(res);

      const result = await prisma.$transaction(async (tx) => {
        // Lock the ticket row: Action Taken writes take a share lock on it
        // (routes/actionsTaken.ts), so no open action can appear between the
        // gate read below and this commit (BR-12). Everything after the lock
        // works on the locked row, not on the earlier read.
        // FOR NO KEY UPDATE still conflicts with the Action Taken FOR SHARE, but
        // not with the FOR KEY SHARE that comment/note/attachment inserts take.
        await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticket.id} FOR NO KEY UPDATE`;
        const locked = await tx.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
        if (locked.currentStatus !== current) throw new StaleStatusError();
        if (expected && locked.updatedAt.getTime() !== expected.getTime()) throw new StaleStatusError();
        // BR-12(a) on the locked row, not on the earlier read.
        if ((target === 'RESOLVED' || target === 'CLOSED') && locked.ticketOwnerId === null) {
          return { unassigned: true } as const;
        }
        const now = new Date(Math.max(Date.now(), locked.updatedAt.getTime() + 1));
        if (target === 'RESOLVED') {
          const actions = await tx.actionTaken.findMany({ where: { ticketId: ticket.id }, select: { status: true } });
          // The owner was checked just above, so UNASSIGNED cannot be among these blockers.
          const gate = computeResolutionGate(locked, actions);
          if (gate.blockers.includes('UNASSIGNED')) return { unassigned: true } as const;
          const blockers = gate.blockers.filter((b): b is 'NO_COMPLETED_ACTION' | 'OPEN_ACTIONS' => b !== 'UNASSIGNED');
          if (blockers.length > 0) return { blocked: blockers } as const;
        }

        const { count } = await tx.ticket.updateMany({
          // Still the status we read, and - when the client sent a token -
          // still the exact version it saw (BR-17).
          where: { id: ticket.id, currentStatus: current, ...(expected ? { updatedAt: expected } : {}) },
          data: {
            currentStatus: target,
            updatedAt: now,
            ...(target === 'RESOLVED' ? { resolvedAt: now } : {}),
            ...(target === 'REOPENED' ? { resolvedAt: null, requesterIndicatedResolved: false } : {}),
          },
        });
        // Defence in depth: the locked-row re-check above already catches a
        // concurrent change, so this guard should never fire.
        if (count === 0) throw new StaleStatusError();

        // BR-13 (owner decision on PR #70): cancelling a Ticket also cancels its
        // open Actions Taken, in this same transaction, so no action is left open
        // on a ticket where BR-10 forbids any further action write.
        if (target === 'CANCELLED') {
          await tx.actionTaken.updateMany({
            where: { ticketId: ticket.id, status: { in: [...OPEN_ACTION_STATUSES] } },
            data: { status: 'CANCELLED', cancelledAt: now, updatedAt: now },
          });
        }

        const statusChange = await tx.ticketStatusChange.create({
          data: { ticketId: ticket.id, fromStatus: current, toStatus: target, changedById: req.user!.id, changedAt: now },
          include: { changedBy: { select: { id: true, name: true } } },
        });
        const updated = await tx.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
        return { updated, statusChange } as const;
      }, LOCKING_TX_OPTIONS);

      if ('unassigned' in result) return unassignedTicket(res);
      if ('blocked' in result) {
        const parts = result.blocked.map((b) => BLOCKER_MESSAGES[b]).filter(Boolean);
        return res.status(409).json({
          error: 'RESOLUTION_BLOCKED',
          message: `This ticket cannot be resolved yet: ${parts.join(' and ')}.`,
          blockers: result.blocked,
        });
      }

      res.status(200).json({
        ...statusSummary(result.updated),
        statusChange: toStatusChange(result.statusChange),
      });
    } catch (error) {
      if (error instanceof StaleStatusError) {
        try {
          const ticket = await prisma.ticket.findFirst({ where: { ticketNumber: req.params.ticketNumber as string } });
          if (ticket) return await staleStatus(res, ticket.id);
        } catch (recoveryError) {
          console.error('Error loading the current ticket after a stale update:', recoveryError);
        }
      }
      console.error('Error changing ticket status:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unable to update status.' });
    }
  }
);

// --------------------------------------------------
// POST /api/staff/tickets/:ticketNumber/notes - create an Internal Note
// (sec 13, BR-15, BR-16). requireRole rejects a Requester before this
// handler - and before any note content is read - satisfying BR-27.
// --------------------------------------------------
router.post(
  '/staff/tickets/:ticketNumber/notes',
  requireAuth,
  requirePasswordChanged,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response) => {
    try {
      const { ticketNumber } = req.params;
      const validation = validateCommentContent(req.body?.content);

      if (!validation.valid) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: validation.error });
      }

      const ticket = await prisma.ticket.findFirst({ where: { ticketNumber: ticketNumber as string } });
      if (!ticket) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Ticket not found.' });
      }

      const note = await prisma.ticketInternalNote.create({
        data: { ticketId: ticket.id, authorId: req.user!.id, content: validation.trimmed! },
      });

      res.status(201).json({
        id: note.id,
        ticketId: note.ticketId,
        authorId: req.user!.id,
        authorName: req.user!.name,
        content: note.content,
        createdAt: note.createdAt,
      });
    } catch (error) {
      console.error('Error creating internal note:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unable to create note.' });
    }
  }
);

export default router;
