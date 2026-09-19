import type { NextFunction, Request, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

// Augment express-session so req.session.userId is recognized, and Express's
// Request type so downstream handlers get a typed req.user.
declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        name: string;
        email: string;
        role: Role;
        mustChangePassword: boolean;
      };
    }
  }
}

/**
 * Lab 3 session authentication middleware (api-spec.md §0).
 *
 * Re-derives { userId, role } from the session store on every request.
 * - Missing/invalid/expired session -> 401 NOT_AUTHENTICATED
 * - Valid session but the underlying user is now inactive -> 401
 *   NOT_AUTHENTICATED, and the session is destroyed server-side.
 * - Otherwise req.user is populated and next() is called.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({
      error: 'NOT_AUTHENTICATED',
      message: 'Please log in.',
    });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.isActive) {
      return req.session.destroy(() => {
        res.status(401).json({
          error: 'NOT_AUTHENTICATED',
          message: 'Please log in.',
        });
      });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };

    return next();
  } catch (error) {
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Unable to verify authentication.',
    });
  }
}

/**
 * Gates every protected endpoint EXCEPT /api/auth/logout, /api/auth/me, and
 * /api/auth/change-password (api-spec.md §0) behind a completed first-login
 * password change (BR-02). Must run AFTER requireAuth. Not yet wired into
 * any router - the Lab 2 Requester/staff routes still predate real auth
 * (Issue #16 migrates them and applies this).
 */
export function requirePasswordChanged(req: Request, res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({
      error: 'PASSWORD_CHANGE_REQUIRED',
      message: 'You must change your password before continuing.',
    });
  }
  return next();
}
