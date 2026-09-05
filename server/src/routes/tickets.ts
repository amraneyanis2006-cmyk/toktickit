import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireActiveRequester } from '../middleware/requesterContext';
import { generateTicketNumber } from '../utils/ticketNumber';
import { validateTicketFields, normalizePagination } from '../utils/validation';

const router = Router();
const prisma = new PrismaClient();

// ──────────────────────────────────────────────
// POST /api/tickets - Créer un ticket
// ──────────────────────────────────────────────
router.post('/tickets', requireActiveRequester, async (req: Request, res: Response) => {
  try {
    const {
      categoryId,
      relatedSystemId,
      requestedPriority,
      summary,
      description
    } = req.body;

    const requesterId = req.requester!.id;

    // UNIT-03: Summary/Description length + trim validation, extracted to
    // utils/validation.ts so it's testable in isolation from HTTP/DB.
    const errors: Record<string, string> = { ...validateTicketFields({ summary, description }) };

    const trimmedSummary = summary?.trim();
    const trimmedDescription = description?.trim();

    if (!categoryId || typeof categoryId !== 'number') {
      errors.categoryId = 'Select a valid category.';
    } else {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, isActive: true },
      });
      if (!category) {
        errors.categoryId = 'Select a valid category.';
      }
    }

    if (!relatedSystemId || typeof relatedSystemId !== 'number') {
      errors.relatedSystemId = 'Select a valid related system.';
    } else {
      const system = await prisma.relatedSystem.findFirst({
        where: { id: relatedSystemId, isActive: true },
      });
      if (!system) {
        errors.relatedSystemId = 'Select a valid related system.';
      }
    }

    const validPriorities = ['LOW', 'MEDIUM', 'HIGH'];
    if (!requestedPriority || !validPriorities.includes(requestedPriority)) {
      errors.requestedPriority = 'Select a valid priority (LOW, MEDIUM, or HIGH).';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        fields: errors,
      });
    }

    // Create the ticket, retrying with a freshly generated number if a rare
    // concurrent-request collision on the unique ticketNumber occurs (P2002).
    let newTicket;
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const ticketNumber = await generateTicketNumber();
        newTicket = await prisma.ticket.create({
          data: {
            ticketNumber,
            requesterId,
            categoryId,
            relatedSystemId,
            requestedPriority,
            summary: trimmedSummary,
            description: trimmedDescription,
          },
        });
        break; // success
      } catch (err: any) {
        lastError = err;
        if (err?.code === 'P2002' && err?.meta?.target?.includes('ticketNumber')) {
          continue; // collision, retry with a freshly generated number
        }
        throw err; // any other error is a real failure, not a retryable collision
      }
    }

    if (!newTicket) {
      throw lastError;
    }

    res.status(201).json({
      id: newTicket.id,
      ticketNumber: newTicket.ticketNumber,
      requesterId: newTicket.requesterId,
      categoryId: newTicket.categoryId,
      relatedSystemId: newTicket.relatedSystemId,
      summary: newTicket.summary,
      description: newTicket.description,
      requestedPriority: newTicket.requestedPriority,
      itPriority: newTicket.itPriority,
      currentStatus: newTicket.currentStatus,
      createdAt: newTicket.createdAt,
      updatedAt: newTicket.updatedAt,
    });

  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Unable to create ticket.',
    });
  }
});

// ──────────────────────────────────────────────
// GET /api/tickets - Liste paginée des tickets
// ──────────────────────────────────────────────
router.get('/tickets', requireActiveRequester, async (req: Request, res: Response) => {
  try {
    const requesterId = req.requester!.id;

    // PAGINATION — UNIT-05: normalizePagination extracted to utils/validation.ts
    const { page, pageSize } = normalizePagination({
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    const skip = (page - 1) * pageSize;

    // TRI
    const allowedSortFields = ['createdAt', 'ticketNumber', 'updatedAt'];
    let sortBy = req.query.sortBy as string;
    if (!allowedSortFields.includes(sortBy)) sortBy = 'createdAt';

    let sortDir = req.query.sortDir as string;
    if (sortDir !== 'asc' && sortDir !== 'desc') sortDir = 'desc';

    // RECHERCHE
    const search = req.query.search as string || '';
    const categoryId = req.query.category ? Number(req.query.category) : undefined;
    const priority = req.query.priority as string || undefined;
    const status = req.query.status as string || undefined;

    // CONSTRUCTION DE LA REQUÊTE
    const where: any = { requesterId };

    if (search.trim()) {
      where.OR = [
        { ticketNumber: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (categoryId) where.categoryId = categoryId;
    if (priority) where.requestedPriority = priority;
    if (status) where.currentStatus = status;

    // EXÉCUTION
    const [tickets, totalItems] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: skip,
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
          category: {
            select: { name: true },
          },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    // FORMATAGE
    const data = tickets.map(ticket => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      summary: ticket.summary,
      categoryName: ticket.category.name,
      requestedPriority: ticket.requestedPriority,
      itPriority: ticket.itPriority,
      currentStatus: ticket.currentStatus,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
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
    console.error('Error fetching tickets:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Unable to load tickets.',
    });
  }
});

// ──────────────────────────────────────────────
// GET /api/tickets/:ticketNumber - Détail d'un ticket + attachments
// ──────────────────────────────────────────────
router.get('/tickets/:ticketNumber', requireActiveRequester, async (req: Request, res: Response) => {
  try {
    const requesterId = req.requester!.id;
    const { ticketNumber } = req.params;

    const ticket = await prisma.ticket.findFirst({
      where: { ticketNumber, requesterId }, // BR-27: ownership check inside the query itself
      include: {
        category: { select: { id: true, name: true } },
        relatedSystem: { select: { id: true, name: true } },
        attachments: {
          orderBy: { uploadedAt: 'desc' },
        },
      },
    });

    if (!ticket) {
      // Existe mais appartient à un autre Requester, OU n'existe pas du tout :
      // réponse identique dans les deux cas (BR-27) pour ne pas révéler l'existence.
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Ticket not found.',
      });
    }

    res.status(200).json({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      requesterId: ticket.requesterId,
      category: ticket.category,
      relatedSystem: ticket.relatedSystem,
      summary: ticket.summary,
      description: ticket.description,
      requestedPriority: ticket.requestedPriority,
      itPriority: ticket.itPriority,
      currentStatus: ticket.currentStatus,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      attachments: ticket.attachments.map(a => ({
        id: a.id,
        originalFileName: a.originalFileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        uploadedAt: a.uploadedAt,
        isRemoved: a.isRemoved,
        ...(a.isRemoved && {
          removedAt: a.removedAt,
          removalReason: a.removalReason,
        }),
      })),
    });

  } catch (error) {
    console.error('Error fetching ticket detail:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Unable to load ticket.',
    });
  }
});

export default router;
