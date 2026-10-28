// Shared Lab 4 test fixtures (not a test file).
//
// Every run tags its rows with a unique suffix, so an interrupted run can
// never make the next one collide on a unique email/name. Rows left behind by
// an interrupted run of the same suite (older than STALE_AFTER_MS) are swept
// at the start of the next run, and every run removes its own rows in
// afterAll - the dev database is never left polluted.

import request from 'supertest';
import * as bcrypt from 'bcrypt';
import type { PrismaClient, Role, TicketStatus, Priority } from '@prisma/client';
import app from '../../src/app';

export const FIXTURE_PASSWORD = 'Lab4FixturePass1!';
const STALE_AFTER_MS = 10 * 60 * 1000;

// Low bcrypt cost for fixtures only: login uses bcrypt.compare, which reads
// the cost from the hash, so production hashing (cost 12) is untouched.
const fixtureHash = bcrypt.hash(FIXTURE_PASSWORD, 4);

export interface Lab4Fixture {
  prefix: string;
  tag: string;
  staffA: { id: number; name: string; email: string };
  staffB: { id: number; name: string; email: string };
  admin: { id: number; name: string; email: string };
  inactiveStaff: { id: number; name: string; email: string };
  requesterA: { id: number; name: string; email: string };
  requesterB: { id: number; name: string; email: string };
  mustChangeStaff: { id: number; name: string; email: string };
  categoryId: number;
  relatedSystemId: number;
}

function ticketPrefixFor(prefix: string) {
  return `TKT-${prefix.toUpperCase()}-`;
}

async function removeRows(
  prisma: PrismaClient,
  where: { userIds: number[]; ticketIds: number[]; categoryIds: number[]; systemIds: number[] }
) {
  const { userIds, ticketIds, categoryIds, systemIds } = where;
  await prisma.actionTaken.deleteMany({
    where: { OR: [{ ticketId: { in: ticketIds } }, { createdById: { in: userIds } }, { performedById: { in: userIds } }] },
  });
  await prisma.ticketStatusChange.deleteMany({
    where: { OR: [{ ticketId: { in: ticketIds } }, { changedById: { in: userIds } }] },
  });
  await prisma.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.ticketComment.deleteMany({
    where: { OR: [{ ticketId: { in: ticketIds } }, { authorId: { in: userIds } }] },
  });
  await prisma.ticketInternalNote.deleteMany({
    where: { OR: [{ ticketId: { in: ticketIds } }, { authorId: { in: userIds } }] },
  });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.relatedSystem.deleteMany({ where: { id: { in: systemIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

/** Deletes every row of this fixture prefix; `olderThan` limits it to stale rows. */
export async function cleanupPrefix(prisma: PrismaClient, prefix: string, olderThan?: Date) {
  const created = olderThan ? { createdAt: { lt: olderThan } } : {};
  const [users, tickets, categories, systems] = await Promise.all([
    prisma.user.findMany({ where: { email: { startsWith: `${prefix}-` }, ...created }, select: { id: true } }),
    prisma.ticket.findMany({ where: { ticketNumber: { startsWith: ticketPrefixFor(prefix) }, ...created }, select: { id: true } }),
    prisma.category.findMany({ where: { name: { startsWith: `${prefix}-` }, ...created }, select: { id: true } }),
    prisma.relatedSystem.findMany({ where: { name: { startsWith: `${prefix}-` }, ...created }, select: { id: true } }),
  ]);
  await removeRows(prisma, {
    userIds: users.map((u) => u.id),
    ticketIds: tickets.map((t) => t.id),
    categoryIds: categories.map((c) => c.id),
    systemIds: systems.map((s) => s.id),
  });
}

export async function createFixture(prisma: PrismaClient, prefix: string): Promise<Lab4Fixture> {
  await cleanupPrefix(prisma, prefix, new Date(Date.now() - STALE_AFTER_MS));

  const tag = `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const passwordHash = await fixtureHash;
  const user = (key: string, name: string, role: Role, extra: { isActive?: boolean; mustChangePassword?: boolean } = {}) =>
    prisma.user.create({
      data: {
        name,
        email: `${tag}-${key}@example.com`,
        role,
        isActive: extra.isActive ?? true,
        mustChangePassword: extra.mustChangePassword ?? false,
        passwordHash,
      },
      select: { id: true, name: true, email: true },
    });

  // Sequential on purpose: a partial Promise.all failure is what left
  // orphaned rows behind in the Lab 3 suites.
  const staffA = await user('staff-a', 'Lab4 Staff A', 'IT_STAFF');
  const staffB = await user('staff-b', 'Lab4 Staff B', 'IT_STAFF');
  const admin = await user('admin', 'Lab4 Admin', 'ADMINISTRATOR');
  const inactiveStaff = await user('inactive', 'Lab4 Inactive Staff', 'IT_STAFF', { isActive: false });
  const requesterA = await user('requester-a', 'Lab4 Requester A', 'REQUESTER');
  const requesterB = await user('requester-b', 'Lab4 Requester B', 'REQUESTER');
  const mustChangeStaff = await user('must-change', 'Lab4 Must Change', 'IT_STAFF', { mustChangePassword: true });
  const category = await prisma.category.create({ data: { name: `${tag} Category` } });
  const relatedSystem = await prisma.relatedSystem.create({ data: { name: `${tag} System` } });

  return {
    prefix,
    tag,
    staffA,
    staffB,
    admin,
    inactiveStaff,
    requesterA,
    requesterB,
    mustChangeStaff,
    categoryId: category.id,
    relatedSystemId: relatedSystem.id,
  };
}

let ticketSeq = 0;

export async function createTicket(
  prisma: PrismaClient,
  fx: Lab4Fixture,
  opts: {
    status?: TicketStatus;
    ownerId?: number | null;
    requesterId?: number;
    itPriority?: Priority | null;
    createdAt?: Date;
    resolvedAt?: Date | null;
  } = {}
) {
  ticketSeq++;
  const ticketNumber = `${ticketPrefixFor(fx.prefix)}${fx.tag.slice(fx.prefix.length + 1)}-${String(ticketSeq).padStart(4, '0')}`;
  return prisma.ticket.create({
    data: {
      ticketNumber,
      requesterId: opts.requesterId ?? fx.requesterA.id,
      ticketOwnerId: opts.ownerId === undefined ? fx.staffA.id : opts.ownerId,
      categoryId: fx.categoryId,
      relatedSystemId: fx.relatedSystemId,
      summary: 'Lab 4 fixture ticket',
      description: 'Fixture ticket created by the Lab 4 server tests.',
      requestedPriority: 'MEDIUM',
      itPriority: opts.itPriority ?? null,
      currentStatus: opts.status ?? 'IN_PROGRESS',
      // A day in the past by default, so tests can record back-dated actions (BR-06).
      createdAt: opts.createdAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000),
      ...(opts.resolvedAt !== undefined ? { resolvedAt: opts.resolvedAt } : {}),
    },
  });
}

export async function loginAs(email: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password: FIXTURE_PASSWORD });
  const raw = res.headers['set-cookie'] as unknown;
  const cookie = Array.isArray(raw) ? raw[0] : raw;
  if (!cookie || typeof cookie !== 'string') {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return cookie;
}

/** A valid create body; override any field per test. */
export function actionBody(overrides: Record<string, unknown> = {}) {
  return {
    actionAt: new Date().toISOString(),
    description: 'Reset the Wi-Fi profile and re-enrolled the certificate.',
    followUpRequired: false,
    ...overrides,
  };
}
