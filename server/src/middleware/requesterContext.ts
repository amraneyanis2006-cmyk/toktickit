import { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Augment Express's Request type so downstream handlers get a typed req.requester
declare global {
  namespace Express {
    interface Request {
      requester?: { id: number; name: string; email: string };
    }
  }
}

/**
 * Lab 2 temporary Development Requester identity middleware.
 *
 * Reads the `x-requester-id` header (see specification.md BR-03, BR-28 and
 * api-spec.md §0). This is a TESTING MECHANISM ONLY — it is trivially spoofable
 * and is replaced by real session-derived identity in Lab 3.
 *
 * - Missing header            -> 401 MISSING_REQUESTER
 * - Header not a valid number -> 401 INVALID_REQUESTER
 * - No matching RequesterUser -> 401 INVALID_REQUESTER
 * - RequesterUser inactive    -> 403 REQUESTER_INACTIVE
 * - Otherwise                 -> req.requester is populated, next() is called
 */
export async function requireActiveRequester(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const rawId = req.header('x-requester-id');

  if (!rawId) {
    return res.status(401).json({
      error: 'MISSING_REQUESTER',
      message: 'A development requester must be selected.',
    });
  }

  const requesterId = Number(rawId);

  if (!Number.isInteger(requesterId) || requesterId <= 0) {
    return res.status(401).json({
      error: 'INVALID_REQUESTER',
      message: 'The provided requester identity is not valid.',
    });
  }

  try {
    const requester = await prisma.requesterUser.findUnique({
      where: { id: requesterId },
    });

    if (!requester) {
      return res.status(401).json({
        error: 'INVALID_REQUESTER',
        message: 'The provided requester identity is not valid.',
      });
    }

    if (!requester.isActive) {
      return res.status(403).json({
        error: 'REQUESTER_INACTIVE',
        message: 'This development requester is no longer active.',
      });
    }

    req.requester = {
      id: requester.id,
      name: requester.name,
      email: requester.email,
    };

    return next();
  } catch (error) {
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Unable to verify requester identity.',
    });
  }
}
