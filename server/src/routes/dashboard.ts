import { Router } from 'express';
import type { Request, Response } from 'express';
import { PrismaClient, TicketStatus } from '@prisma/client';
import { requireAuth, requirePasswordChanged, requireRole } from '../middleware/auth';
import { ACTIVE_STATUSES, OPEN_ACTION_STATUSES, RECENT_WINDOW_DAYS, recentWindowStart } from '../utils/dashboard';

// Role dashboards (api-spec.md sec 9-10, specification.md sec 5.2, BR-21..BR-27).
// Every number is counted by the database at request time; lists are capped at 5.

const router = Router();
const prisma = new PrismaClient();

const LIMIT = 5;
const active = { in: [...ACTIVE_STATUSES] };
const openActions = { in: [...OPEN_ACTION_STATUSES] };
const ACTIVE_LIST = ACTIVE_STATUSES.join(',');
const ticketItem = { ticketNumber: true, summary: true, currentStatus: true, updatedAt: true } as const;
const recentOrder = [{ updatedAt: 'desc' as const }, { ticketNumber: 'desc' as const }];

function failure(res: Response, error: unknown) {
  console.error('Error loading dashboard:', error);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: "We couldn't load your dashboard." });
}

// --------------------------------------------------
// GET /api/dashboard/requester - session-scoped (BR-24); query parameters ignored.
// --------------------------------------------------
router.get('/dashboard/requester', requireAuth, requirePasswordChanged, requireRole('REQUESTER'), async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const mine = { requesterId: req.user!.id };
    const [openTickets, waitingForMe, resolvedLast7Days, closedTickets, attentionTickets, recentTickets] = await Promise.all([
      prisma.ticket.count({ where: { ...mine, currentStatus: active } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: 'WAITING_FOR_REQUESTER' } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: { in: ['RESOLVED', 'CLOSED'] }, resolvedAt: { gte: recentWindowStart(now) } } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: 'CLOSED' } }),
      prisma.ticket.findMany({
        where: { ...mine, currentStatus: 'WAITING_FOR_REQUESTER' },
        orderBy: [{ updatedAt: 'asc' }, { ticketNumber: 'asc' }],
        take: LIMIT,
        select: ticketItem,
      }),
      prisma.ticket.findMany({ where: mine, orderBy: recentOrder, take: LIMIT, select: ticketItem }),
    ]);
    res.status(200).json({
      generatedAt: now,
      windowDays: RECENT_WINDOW_DAYS,
      metrics: {
        openTickets: { value: openTickets, drillDown: `/tickets?status=${ACTIVE_LIST}` },
        waitingForMe: { value: waitingForMe, drillDown: '/tickets?status=WAITING_FOR_REQUESTER' },
        resolvedLast7Days: { value: resolvedLast7Days, drillDown: `/tickets?status=RESOLVED,CLOSED&resolvedWithinDays=${RECENT_WINDOW_DAYS}` },
        closedTickets: { value: closedTickets, drillDown: '/tickets?status=CLOSED' },
      },
      attentionTickets,
      recentTickets,
    });
  } catch (error) {
    failure(res, error);
  }
});

// --------------------------------------------------
// GET /api/dashboard/staff - IT Staff and Administrators; userAccounts only for
// an Administrator (BR-27).
// --------------------------------------------------
router.get('/dashboard/staff', requireAuth, requirePasswordChanged, requireRole('IT_STAFF', 'ADMINISTRATOR'), async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const me = req.user!.id;
    const [unassignedOpen, myOpenTickets, awaitingReview, highPriorityOpen, myOpenActions, statusGroups, priorityGroups, myOpenActionsList, urgentTickets, recentTickets] =
      await Promise.all([
        prisma.ticket.count({ where: { ticketOwnerId: null, currentStatus: active } }),
        prisma.ticket.count({ where: { ticketOwnerId: me, currentStatus: active } }),
        prisma.ticket.count({ where: { requesterIndicatedResolved: true, currentStatus: active } }),
        prisma.ticket.count({ where: { itPriority: 'HIGH', currentStatus: active } }),
        prisma.actionTaken.count({ where: { performedById: me, status: openActions } }),
        prisma.ticket.groupBy({ by: ['currentStatus'], _count: { _all: true } }),
        prisma.ticket.groupBy({ by: ['itPriority'], where: { currentStatus: active }, _count: { _all: true } }),
        prisma.actionTaken.findMany({
          where: { performedById: me, status: openActions },
          orderBy: [{ actionAt: 'asc' }, { id: 'asc' }],
          take: LIMIT,
          include: { ticket: { select: { ticketNumber: true, summary: true } } },
        }),
        prisma.ticket.findMany({
          where: { itPriority: 'HIGH', currentStatus: active },
          orderBy: [{ createdAt: 'asc' }, { ticketNumber: 'asc' }],
          take: LIMIT,
          select: {
            ticketNumber: true, summary: true, currentStatus: true, itPriority: true, createdAt: true,
            ticketOwner: { select: { id: true, name: true } },
          },
        }),
        prisma.ticket.findMany({ orderBy: recentOrder, take: LIMIT, select: ticketItem }),
      ]);

    // All 8 statuses and all 4 priorities, zeros included (api-spec sec 10).
    const byStatus = Object.fromEntries(Object.values(TicketStatus).map((s) => [s, 0])) as Record<TicketStatus, number>;
    for (const g of statusGroups) byStatus[g.currentStatus] = g._count._all;
    const byItPriority = { LOW: 0, MEDIUM: 0, HIGH: 0, NONE: 0 };
    for (const g of priorityGroups) byItPriority[g.itPriority ?? 'NONE'] = g._count._all;

    const body: Record<string, unknown> = {
      generatedAt: now,
      windowDays: RECENT_WINDOW_DAYS,
      metrics: {
        unassignedOpen: { value: unassignedOpen, drillDown: `/staff/tickets?ownership=unassigned&status=${ACTIVE_LIST}` },
        myOpenTickets: { value: myOpenTickets, drillDown: `/staff/tickets?ownership=mine&status=${ACTIVE_LIST}` },
        awaitingReview: { value: awaitingReview, drillDown: `/staff/tickets?requesterResolved=true&status=${ACTIVE_LIST}` },
        highPriorityOpen: { value: highPriorityOpen, drillDown: `/staff/tickets?priority=HIGH&status=${ACTIVE_LIST}` },
        myOpenActions: { value: myOpenActions, drillDown: '#my-open-actions' },
      },
      byStatus,
      byItPriority,
      myOpenActionsList: myOpenActionsList.map((a) => ({
        id: a.id,
        ticketNumber: a.ticket.ticketNumber,
        ticketSummary: a.ticket.summary,
        description: a.description,
        status: a.status,
        actionAt: a.actionAt,
        followUpRequired: a.followUpRequired,
      })),
      urgentTickets,
      recentTickets,
    };

    if (req.user!.role === 'ADMINISTRATOR') {
      const [activeRequesters, activeItStaff, activeAdministrators, inactive] = await Promise.all([
        prisma.user.count({ where: { isActive: true, role: 'REQUESTER' } }),
        prisma.user.count({ where: { isActive: true, role: 'IT_STAFF' } }),
        prisma.user.count({ where: { isActive: true, role: 'ADMINISTRATOR' } }),
        prisma.user.count({ where: { isActive: false } }),
      ]);
      body.userAccounts = { activeRequesters, activeItStaff, activeAdministrators, inactive };
    }

    res.status(200).json(body);
  } catch (error) {
    failure(res, error);
  }
});

export default router;
