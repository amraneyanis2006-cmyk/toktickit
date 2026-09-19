import { Router } from 'express';
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '../utils/password';
import { normalizeEmail } from '../utils/email';
import { requireAuth } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

function publicUser(user: { id: number; name: string; email: string; role: string; mustChangePassword: boolean }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

// ──────────────────────────────────────────────
// POST /api/auth/login (public)
// ──────────────────────────────────────────────
router.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Email and password are required.',
    });
  }

  try {
    const normalizedEmail = normalizeEmail(String(email));
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);

    if (!passwordMatches) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    req.session.userId = user.id;

    return res.status(200).json(publicUser(user));
  } catch (error) {
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Unable to log in.',
    });
  }
});

// ──────────────────────────────────────────────
// POST /api/auth/logout
// Already-unauthenticated is treated as a no-op success (api-spec.md §2).
// ──────────────────────────────────────────────
router.post('/auth/logout', (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(200).json({ loggedOut: true });
  }

  req.session.destroy(() => {
    res.clearCookie('sid');
    res.status(200).json({ loggedOut: true });
  });
});

// ──────────────────────────────────────────────
// GET /api/auth/me
// Exempt from PASSWORD_CHANGE_REQUIRED - requireAuth only, no
// requirePasswordChanged - so the client can always route to Change Password.
// ──────────────────────────────────────────────
router.get('/auth/me', requireAuth, (req: Request, res: Response) => {
  res.status(200).json(publicUser(req.user!));
});

// ──────────────────────────────────────────────
// POST /api/auth/change-password
// Also exempt from PASSWORD_CHANGE_REQUIRED - this is how the gate is cleared.
// ──────────────────────────────────────────────
router.post('/auth/change-password', requireAuth, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Current password and new password are required.',
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      fields: { newPassword: 'New password must be at least 8 characters.' },
    });
  }

  if (newPassword === currentPassword) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      fields: { newPassword: 'New password must be different from the current password.' },
    });
  }

  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const currentMatches = await verifyPassword(currentPassword, user.passwordHash);

    if (!currentMatches) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        fields: { currentPassword: 'Current password is incorrect.' },
      });
    }

    const passwordHash = await hashPassword(newPassword);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    return res.status(200).json({ id: updated.id, mustChangePassword: updated.mustChangePassword });
  } catch (error) {
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Unable to change password.',
    });
  }
});

export default router;
