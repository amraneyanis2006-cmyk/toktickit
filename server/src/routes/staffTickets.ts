import { Router } from 'express';
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requirePasswordChanged, requireRole } from '../middleware/auth';
import { normalizePagination } from '../utils/validation';

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

export default router;
