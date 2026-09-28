import { Router } from 'express';
import type { Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireAuth, requirePasswordChanged, requireRole } from '../middleware/auth';
import { normalizeEmail } from '../utils/email';
import { hashPassword } from '../utils/password';
import { generateInitialPassword } from '../utils/initialPassword';

const router = Router();
const prisma = new PrismaClient();

const ROLES = ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'] as const;
type RoleValue = (typeof ROLES)[number];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AdminUserRow = {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
};

function toAdminUser(u: AdminUserRow) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
  };
}

/**
 * Delivery channel for a generated initial password (api-spec.md sec 15/17):
 * server console only, NEVER the HTTP response (BR-04/BR-23). Emailing it is
 * out of scope for Lab 3.
 */
function logInitialPassword(email: string, password: string) {
  console.log(`[LOCAL DEV ONLY] initial password for ${email}: ${password}`);
}

function notFound(res: Response) {
  return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.' });
}

function duplicateEmail(res: Response) {
  return res.status(409).json({
    error: 'DUPLICATE_EMAIL',
    message: 'This email address is already in use.',
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Runs fn in a SERIALIZABLE transaction, retrying on serialization failure
 * (P2034). The "last active Administrator" check (BR-22) reads a count and then
 * writes, so without this two concurrent requests could each deactivate a
 * different admin and leave zero.
 */
async function runSerializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      if (!retryable || attempt >= 2) throw error;
    }
  }
}

// --------------------------------------------------
// GET /api/admin/users - list, search by name/email, optional role filter (sec 14)
// --------------------------------------------------
router.get(
  '/admin/users',
  requireAuth,
  requirePasswordChanged,
  requireRole('ADMINISTRATOR'),
  async (req: Request, res: Response) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const roleParam = typeof req.query.role === 'string' ? req.query.role : '';

      const where: Prisma.UserWhereInput = {};
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }
      if ((ROLES as readonly string[]).includes(roleParam)) {
        where.role = roleParam as RoleValue;
      }

      const users = await prisma.user.findMany({
        where,
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });

      res.status(200).json(users);
    } catch (error) {
      console.error('Error listing users:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unable to load users.' });
    }
  }
);

// --------------------------------------------------
// POST /api/admin/users - create a user with a system-generated initial password (sec 15)
// --------------------------------------------------
router.post(
  '/admin/users',
  requireAuth,
  requirePasswordChanged,
  requireRole('ADMINISTRATOR'),
  async (req: Request, res: Response) => {
    try {
      const { name, email, role, isActive } = req.body ?? {};
      const fields: Record<string, string> = {};

      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) fields.name = 'Name is required.';

      const normalizedEmail = typeof email === 'string' ? normalizeEmail(email) : '';
      if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
        fields.email = 'A valid email address is required.';
      }

      if (!(ROLES as readonly string[]).includes(role)) fields.role = 'Select a valid role.';

      if (isActive !== undefined && typeof isActive !== 'boolean') {
        fields.isActive = 'isActive must be true or false.';
      }

      if (Object.keys(fields).length > 0) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', fields });
      }

      const existing = await prisma.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      });
      if (existing) return duplicateEmail(res);

      const initialPassword = generateInitialPassword();
      const created = await prisma.user.create({
        data: {
          name: trimmedName,
          email: normalizedEmail,
          role: role as RoleValue,
          isActive: isActive ?? true,
          mustChangePassword: true,
          passwordHash: await hashPassword(initialPassword),
        },
      });

      logInitialPassword(created.email, initialPassword);
      res.status(201).json(toAdminUser(created));
    } catch (error) {
      if (isUniqueViolation(error)) return duplicateEmail(res);
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unable to create user.' });
    }
  }
);

// --------------------------------------------------
// PATCH /api/admin/users/:id - edit name, email, role, activation (sec 16)
// --------------------------------------------------
type PatchOutcome =
  | { kind: 'ok'; user: AdminUserRow }
  | { kind: 'not_found' }
  | { kind: 'duplicate' }
  | { kind: 'last_admin' };

router.patch(
  '/admin/users/:id',
  requireAuth,
  requirePasswordChanged,
  requireRole('ADMINISTRATOR'),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return notFound(res);

      const body = req.body ?? {};
      const fields: Record<string, string> = {};

      let newName: string | undefined;
      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || !body.name.trim()) fields.name = 'Name cannot be empty.';
        else newName = body.name.trim();
      }

      let newEmail: string | undefined;
      if (body.email !== undefined) {
        const candidate = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
        if (!EMAIL_PATTERN.test(candidate)) fields.email = 'A valid email address is required.';
        else newEmail = candidate;
      }

      let newRole: RoleValue | undefined;
      if (body.role !== undefined) {
        if (!(ROLES as readonly string[]).includes(body.role)) fields.role = 'Select a valid role.';
        else newRole = body.role as RoleValue;
      }

      let newIsActive: boolean | undefined;
      if (body.isActive !== undefined) {
        if (typeof body.isActive !== 'boolean') fields.isActive = 'isActive must be true or false.';
        else newIsActive = body.isActive;
      }

      if (Object.keys(fields).length > 0) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', fields });
      }

      // BR-22: an Administrator can never deactivate their own account.
      if (newIsActive === false && id === req.user!.id) {
        return res.status(403).json({
          error: 'SELF_DEACTIVATION_FORBIDDEN',
          message: 'You cannot deactivate your own account.',
        });
      }

      const outcome = await runSerializable<PatchOutcome>(async (tx) => {
        const target = await tx.user.findUnique({ where: { id } });
        if (!target) return { kind: 'not_found' };

        const data: Prisma.UserUpdateInput = {};
        if (newName !== undefined) data.name = newName;
        if (newRole !== undefined) data.role = newRole;
        if (newIsActive !== undefined) data.isActive = newIsActive;

        if (newEmail !== undefined && newEmail !== target.email) {
          const clash = await tx.user.findFirst({
            where: { id: { not: id }, email: { equals: newEmail, mode: 'insensitive' } },
          });
          if (clash) return { kind: 'duplicate' };
          data.email = newEmail;
        }

        // BR-22: the last active Administrator can be neither deactivated nor demoted,
        // whichever Administrator makes the request.
        const losesAdminAccess =
          target.role === 'ADMINISTRATOR' &&
          target.isActive &&
          (newIsActive === false || (newRole !== undefined && newRole !== 'ADMINISTRATOR'));

        if (losesAdminAccess) {
          const otherActiveAdmins = await tx.user.count({
            where: { id: { not: id }, role: 'ADMINISTRATOR', isActive: true },
          });
          if (otherActiveAdmins === 0) return { kind: 'last_admin' };
        }

        const user = await tx.user.update({ where: { id }, data });
        return { kind: 'ok', user };
      });

      if (outcome.kind === 'not_found') return notFound(res);
      if (outcome.kind === 'duplicate') return duplicateEmail(res);
      if (outcome.kind === 'last_admin') {
        return res.status(409).json({
          error: 'LAST_ADMIN_PROTECTED',
          message: 'At least one active Administrator must remain.',
        });
      }

      res.status(200).json(toAdminUser(outcome.user));
    } catch (error) {
      if (isUniqueViolation(error)) return duplicateEmail(res);
      console.error('Error updating user:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unable to update user.' });
    }
  }
);

// --------------------------------------------------
// PATCH /api/admin/users/:id/reset-password - issue a new initial password (sec 17)
// --------------------------------------------------
router.patch(
  '/admin/users/:id/reset-password',
  requireAuth,
  requirePasswordChanged,
  requireRole('ADMINISTRATOR'),
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return notFound(res);

      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) return notFound(res);

      const initialPassword = generateInitialPassword();
      await prisma.user.update({
        where: { id },
        data: { passwordHash: await hashPassword(initialPassword), mustChangePassword: true },
      });

      logInitialPassword(target.email, initialPassword);
      res.status(200).json({ id, mustChangePassword: true });
    } catch (error) {
      console.error('Error resetting password:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unable to reset password.' });
    }
  }
);

export default router;
