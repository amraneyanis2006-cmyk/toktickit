import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { backfillResolvedAt, RESOLVED_AT_BACKFILL_SQL } from '../../src/utils/resolvedAtBackfill';
import { createFixture, cleanupPrefix, createTicket, loginAs } from './fixtures';
import type { Lab4Fixture } from './fixtures';
import {
  SEED_ACCOUNT_EMAILS,
  SEED_CATEGORY_NAMES,
  SEED_SYSTEM_NAMES,
  LEGACY_SEED_TICKET_NUMBERS,
  SEED_ACTION_KEY_PREFIX,
} from '../../../prisma/seedData';

const prisma = new PrismaClient();
const PREFIX = 'l4mig';
const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_NAME = '20261028000001_lab4_actions_taken';
const MIGRATION_SQL = path.join(ROOT, 'prisma/migrations', MIGRATION_NAME, 'migration.sql');

let fx: Lab4Fixture;

beforeAll(async () => {
  fx = await createFixture(prisma, PREFIX);
});

afterAll(async () => {
  await cleanupPrefix(prisma, PREFIX);
  await prisma.$disconnect();
});

describe('Lab 4 migration', () => {
  it('MIG-01: the Lab 4 migration SQL is additive only and has been applied', async () => {
    const sql = readFileSync(MIGRATION_SQL, 'utf8');
    const statements = sql
      .replace(/--.*$/gm, '')
      .split(';')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter(Boolean);

    for (const s of statements) {
      expect(s, s).not.toMatch(/\bDROP\b/i);
      expect(s, s).not.toMatch(/\bDELETE\s+FROM\b/i); // "ON DELETE RESTRICT" in a new FK is fine
      expect(s, s).not.toMatch(/\bTRUNCATE\b/i);
      expect(s, s).not.toMatch(/\bALTER\b.*\bTYPE\b/i);
      expect(s, s).not.toMatch(/\bRENAME\b/i);
      if (/^ALTER TABLE/i.test(s)) expect(s, s).toMatch(/^ALTER TABLE "\w+" ADD (COLUMN|CONSTRAINT) /i);
    }
    expect(sql).toMatch(/CREATE TYPE "ActionStatus" AS ENUM \('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'\)/);
    expect(sql).toMatch(/CREATE TABLE "ActionTaken"/);
    expect(sql).toMatch(/CREATE TABLE "TicketStatusChange"/);
    expect(sql).toMatch(/ALTER TABLE "Ticket" ADD COLUMN\s+"resolvedAt"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "ActionTaken_ticketId_clientRequestId_key"/);

    const applied = await prisma.$queryRaw<Array<{ finished: boolean }>>`
      SELECT finished_at IS NOT NULL AS finished FROM "_prisma_migrations"
      WHERE migration_name = ${MIGRATION_NAME} AND rolled_back_at IS NULL`;
    expect(applied).toEqual([{ finished: true }]);
  });

  it('MIG-02: the resolvedAt backfill sets updatedAt on legacy RESOLVED/CLOSED tickets only, and re-running is a no-op', async () => {
    const sql = readFileSync(MIGRATION_SQL, 'utf8').replace(/\s+/g, ' ');
    expect(sql).toContain(RESOLVED_AT_BACKFILL_SQL.replace(/\s+/g, ' '));

    const resolved = await createTicket(prisma, fx, { status: 'RESOLVED' });
    const closed = await createTicket(prisma, fx, { status: 'CLOSED' });
    const known = new Date('2026-10-01T10:00:00.000Z');
    const alreadySet = await createTicket(prisma, fx, { status: 'RESOLVED', resolvedAt: known });
    const active = await createTicket(prisma, fx, { status: 'IN_PROGRESS' });
    const ids = [resolved.id, closed.id, alreadySet.id, active.id];

    expect(await backfillResolvedAt(prisma, ids)).toBe(2);
    const rows = await prisma.ticket.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(resolved.id)!.resolvedAt).toEqual(byId.get(resolved.id)!.updatedAt);
    expect(byId.get(closed.id)!.resolvedAt).toEqual(byId.get(closed.id)!.updatedAt);
    expect(byId.get(alreadySet.id)!.resolvedAt).toEqual(known);
    expect(byId.get(active.id)!.resolvedAt).toBeNull();
    // The backfill is raw SQL: it must not touch updatedAt.
    expect(byId.get(resolved.id)!.updatedAt).toEqual(resolved.updatedAt);

    expect(await backfillResolvedAt(prisma, ids)).toBe(0);
    const again = await prisma.ticket.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });
    expect(again).toEqual([...rows].sort((a, b) => a.id - b.id));
  });

  it('MIG-03: Lab 1-3 data stays readable through the Lab 3 endpoints; legacy tickets have no actions or history', async () => {
    const legacy = await createTicket(prisma, fx, { requesterId: fx.requesterA.id, status: 'OPEN' });
    await prisma.attachment.create({
      data: {
        ticketId: legacy.id,
        originalFileName: 'legacy.png',
        storedFileName: `${fx.tag}-legacy.png`,
        mimeType: 'image/png',
        sizeBytes: 1234,
      },
    });
    await prisma.ticketComment.create({ data: { ticketId: legacy.id, authorId: fx.requesterA.id, content: 'Legacy public comment' } });
    await prisma.ticketInternalNote.create({ data: { ticketId: legacy.id, authorId: fx.staffA.id, content: 'Legacy internal note' } });

    const staff = await request(app).get(`/api/staff/tickets/${legacy.ticketNumber}`).set('Cookie', await loginAs(fx.staffA.email));
    expect(staff.status).toBe(200);
    expect(staff.body.attachments).toHaveLength(1);
    expect(staff.body.publicComments.map((c: { content: string }) => c.content)).toEqual(['Legacy public comment']);
    expect(staff.body.internalNotes.map((n: { content: string }) => n.content)).toEqual(['Legacy internal note']);
    expect(staff.body.actionsTaken).toEqual([]);
    expect(staff.body.statusHistory).toEqual([]);

    const requesterCookie = await loginAs(fx.requesterA.email);
    const own = await request(app).get(`/api/tickets/${legacy.ticketNumber}`).set('Cookie', requesterCookie);
    expect(own.status).toBe(200);
    expect(own.body.attachments[0].originalFileName).toBe('legacy.png');
    expect(own.body.publicComments).toHaveLength(1);
    expect(own.body.actionsTaken).toEqual([]);
    expect(own.body.statusHistory).toEqual([]);
    expect(own.body).not.toHaveProperty('internalNotes');

    const list = await request(app).get('/api/tickets').query({ search: legacy.ticketNumber }).set('Cookie', requesterCookie);
    expect(list.status).toBe(200);
    expect(list.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([legacy.ticketNumber]);

    const users = await request(app).get('/api/admin/users').query({ search: fx.tag }).set('Cookie', await loginAs(fx.admin.email));
    expect(users.status).toBe(200);
    expect(users.body.map((u: { email: string }) => u.email)).toContain(fx.requesterA.email);
  });

  it('MIG-04: running the seed twice leaves every seeded table count unchanged', async () => {
    const runSeed = () =>
      execFileSync(path.join(ROOT, 'node_modules/.bin/tsx'), ['prisma/seed.ts'], { cwd: ROOT, stdio: 'pipe' });

    // Lab 4 seed tickets have ordinary sequence numbers; they are the tickets
    // that carry seed-keyed Actions Taken.
    const seedTickets = {
      OR: [
        { ticketNumber: { in: LEGACY_SEED_TICKET_NUMBERS } },
        { actionsTaken: { some: { clientRequestId: { startsWith: SEED_ACTION_KEY_PREFIX } } } },
      ],
    };
    const counts = async () => ({
      users: await prisma.user.count({ where: { email: { in: SEED_ACCOUNT_EMAILS } } }),
      categories: await prisma.category.count({ where: { name: { in: SEED_CATEGORY_NAMES } } }),
      systems: await prisma.relatedSystem.count({ where: { name: { in: SEED_SYSTEM_NAMES } } }),
      tickets: await prisma.ticket.count({ where: seedTickets }),
      comments: await prisma.ticketComment.count({ where: { ticket: seedTickets } }),
      notes: await prisma.ticketInternalNote.count({ where: { ticket: seedTickets } }),
      actions: await prisma.actionTaken.count({ where: { clientRequestId: { startsWith: SEED_ACTION_KEY_PREFIX } } }),
      statusChanges: await prisma.ticketStatusChange.count({ where: { ticket: seedTickets } }),
    });

    runSeed();
    const first = await counts();
    runSeed();
    const second = await counts();

    expect(second).toEqual(first);
    expect(first.users).toBe(SEED_ACCOUNT_EMAILS.length);
    expect(first.actions).toBeGreaterThanOrEqual(8);
    expect(first.statusChanges).toBeGreaterThan(0);
    // Lab 4 seed tickets use the normal TKT-YYYY-NNNNNN format of the live sequence.
    const lab4 = await prisma.ticket.findMany({
      where: { actionsTaken: { some: { clientRequestId: { startsWith: SEED_ACTION_KEY_PREFIX } } } },
      select: { ticketNumber: true },
    });
    expect(lab4.length).toBeGreaterThanOrEqual(6);
    // BR-10/BR-13 invariant: no seed ticket in an inactive status has an open action.
    const openOnInactive = await prisma.actionTaken.count({
      where: { status: { in: ['PLANNED', 'IN_PROGRESS'] }, ticket: { ...seedTickets, currentStatus: { in: ['RESOLVED', 'CLOSED', 'CANCELLED'] } } },
    });
    expect(openOnInactive).toBe(0);
    // Not trivially true: some inactive seed tickets do carry (finished) actions.
    const actionsOnInactive = await prisma.actionTaken.count({
      where: { ticket: { ...seedTickets, currentStatus: { in: ['RESOLVED', 'CLOSED', 'CANCELLED'] } } },
    });
    expect(actionsOnInactive).toBeGreaterThan(0);
    for (const t of lab4) expect(t.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
  }, 180_000);
});
