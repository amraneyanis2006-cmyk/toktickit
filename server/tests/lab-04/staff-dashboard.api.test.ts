import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { ActionStatus } from '@prisma/client';
import app from '../../src/app';
import { createFixture, cleanupPrefix, createTicket, loginAs } from './fixtures';
import type { Lab4Fixture } from './fixtures';

const prisma = new PrismaClient();
const PREFIX = 'l4ds';
const ACTIVE = `('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')`;
const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'];
const ACTIVE_LIST = 'NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED';

let fx: Lab4Fixture;
let staffCookie: string;

const dashboard = (cookie: string) => request(app).get('/api/dashboard/staff').set('Cookie', cookie);

async function sql(query: string, ...params: unknown[]) {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(query, ...params);
  return rows[0]!.n;
}

function addAction(ticketId: number, performedById: number, status: ActionStatus, minutesAgo: number) {
  return prisma.actionTaken.create({
    data: {
      ticketId, performedById, createdById: performedById, status,
      actionAt: new Date(Date.now() - minutesAgo * 60_000), description: `Fixture ${status} action`,
    },
  });
}

beforeAll(async () => {
  fx = await createFixture(prisma, PREFIX);
  const s = fx.staffA.id;
  const unassigned = await createTicket(prisma, fx, { status: 'NEW', ownerId: null, itPriority: 'HIGH' });
  const mine = await createTicket(prisma, fx, { status: 'IN_PROGRESS', ownerId: s, itPriority: 'MEDIUM' });
  await createTicket(prisma, fx, { status: 'OPEN', ownerId: s, itPriority: null });
  // An old inactive HIGH ticket that must never appear in urgentTickets (active only).
  await createTicket(prisma, fx, { status: 'RESOLVED', ownerId: s, itPriority: 'HIGH', resolvedAt: new Date(), createdAt: new Date('2000-01-01T00:00:00.000Z') });
  const review = await createTicket(prisma, fx, { status: 'WAITING_FOR_REQUESTER', ownerId: fx.staffB.id, itPriority: 'LOW' });
  const reviewDone = await createTicket(prisma, fx, { status: 'CLOSED', ownerId: s, resolvedAt: new Date() });
  await prisma.ticket.updateMany({ where: { id: { in: [review.id, reviewDone.id] } }, data: { requesterIndicatedResolved: true } });
  for (let i = 0; i < 6; i++) await createTicket(prisma, fx, { status: 'REOPENED', ownerId: s, itPriority: 'HIGH', createdAt: new Date(Date.now() - (10 + i) * 86_400_000) });
  // Staff A: 6 open actions (list capped at 5) and finished ones that must not count; Staff B: none open.
  for (let i = 0; i < 4; i++) await addAction(mine.id, s, 'PLANNED', 100 + i);
  await addAction(unassigned.id, s, 'IN_PROGRESS', 50);
  await addAction(mine.id, s, 'IN_PROGRESS', 500);
  await addAction(mine.id, s, 'COMPLETED', 10);
  await addAction(mine.id, fx.staffB.id, 'COMPLETED', 10);
  await addAction(mine.id, fx.staffB.id, 'CANCELLED', 10);
  staffCookie = await loginAs(fx.staffA.email);
});

afterAll(async () => {
  await cleanupPrefix(prisma, PREFIX);
  await prisma.$disconnect();
});

describe('GET /api/dashboard/staff', () => {
  it('DASH-07: every metric and every byStatus / byItPriority key equals the raw SQL count', async () => {
    const res = await dashboard(staffCookie);
    expect(res.status).toBe(200);
    const s = fx.staffA.id;
    const m = res.body.metrics;
    expect(m.unassignedOpen.value).toBe(await sql(`SELECT count(*)::int AS n FROM "Ticket" WHERE "ticketOwnerId" IS NULL AND "currentStatus" IN ${ACTIVE}`));
    expect(m.myOpenTickets.value).toBe(await sql(`SELECT count(*)::int AS n FROM "Ticket" WHERE "ticketOwnerId" = $1 AND "currentStatus" IN ${ACTIVE}`, s));
    expect(m.awaitingReview.value).toBe(await sql(`SELECT count(*)::int AS n FROM "Ticket" WHERE "requesterIndicatedResolved" AND "currentStatus" IN ${ACTIVE}`));
    expect(m.highPriorityOpen.value).toBe(await sql(`SELECT count(*)::int AS n FROM "Ticket" WHERE "itPriority" = 'HIGH' AND "currentStatus" IN ${ACTIVE}`));
    expect(m.myOpenActions.value).toBe(await sql(`SELECT count(*)::int AS n FROM "ActionTaken" WHERE "performedById" = $1 AND status IN ('PLANNED','IN_PROGRESS')`, s));
    expect(m.myOpenActions.value).toBe(6);

    expect(Object.keys(res.body.byStatus).sort()).toEqual([...STATUSES].sort());
    for (const status of STATUSES) {
      expect(res.body.byStatus[status], status).toBe(await sql(`SELECT count(*)::int AS n FROM "Ticket" WHERE "currentStatus" = $1::"TicketStatus"`, status));
    }
    expect(Object.keys(res.body.byItPriority).sort()).toEqual(['HIGH', 'LOW', 'MEDIUM', 'NONE']);
    for (const p of ['LOW', 'MEDIUM', 'HIGH']) {
      expect(res.body.byItPriority[p], p).toBe(await sql(`SELECT count(*)::int AS n FROM "Ticket" WHERE "itPriority" = $1::"Priority" AND "currentStatus" IN ${ACTIVE}`, p));
    }
    expect(res.body.byItPriority.NONE).toBe(await sql(`SELECT count(*)::int AS n FROM "Ticket" WHERE "itPriority" IS NULL AND "currentStatus" IN ${ACTIVE}`));
    expect(res.body).toMatchObject({ windowDays: 7, generatedAt: expect.any(String) });
  });

  it('DASH-08: every drill-down query returns totalItems equal to its card value', async () => {
    const res = await dashboard(staffCookie);
    const m = res.body.metrics;
    expect(m.unassignedOpen.drillDown).toBe(`/staff/tickets?ownership=unassigned&status=${ACTIVE_LIST}`);
    expect(m.myOpenTickets.drillDown).toBe(`/staff/tickets?ownership=mine&status=${ACTIVE_LIST}`);
    expect(m.awaitingReview.drillDown).toBe(`/staff/tickets?requesterResolved=true&status=${ACTIVE_LIST}`);
    expect(m.highPriorityOpen.drillDown).toBe(`/staff/tickets?priority=HIGH&status=${ACTIVE_LIST}`);
    expect(m.myOpenActions.drillDown).toBe('#my-open-actions');

    const checks: Array<[string, string, number]> = [
      ...['unassignedOpen', 'myOpenTickets', 'awaitingReview', 'highPriorityOpen'].map((k) => [k, m[k].drillDown, m[k].value] as [string, string, number]),
      ...STATUSES.map((st) => [st, `/staff/tickets?status=${st}`, res.body.byStatus[st]] as [string, string, number]),
      ...['LOW', 'MEDIUM', 'HIGH', 'NONE'].map((p) => [p, `/staff/tickets?priority=${p}&status=${ACTIVE_LIST}`, res.body.byItPriority[p]] as [string, string, number]),
    ];
    for (const [key, path, value] of checks) {
      const list = await request(app).get(`/api${path}`).set('Cookie', staffCookie);
      expect(list.status, key).toBe(200);
      expect(list.body.pagination.totalItems, key).toBe(value);
    }
  });

  it('DASH-09: Requester 403, no session 401, IT Staff without userAccounts, Administrator with userAccounts equal to SQL', async () => {
    const requester = await dashboard(await loginAs(fx.requesterA.email));
    expect(requester.status).toBe(403);
    expect(requester.body.error).toBe('FORBIDDEN');
    const anonymous = await request(app).get('/api/dashboard/staff');
    expect(anonymous.status).toBe(401);

    expect((await dashboard(staffCookie)).body).not.toHaveProperty('userAccounts');

    const admin = await dashboard(await loginAs(fx.admin.email));
    expect(admin.status).toBe(200);
    const count = (role: string) => sql(`SELECT count(*)::int AS n FROM "User" WHERE "isActive" AND role = $1::"Role"`, role);
    expect(admin.body.userAccounts).toEqual({
      activeRequesters: await count('REQUESTER'),
      activeItStaff: await count('IT_STAFF'),
      activeAdministrators: await count('ADMINISTRATOR'),
      inactive: await sql(`SELECT count(*)::int AS n FROM "User" WHERE NOT "isActive"`),
    });
    // The user-account drill-downs (spec sec 5.2) list exactly as many users as the card.
    const adminCookie = await loginAs(fx.admin.email);
    for (const [path, value] of [
      ['/admin/users?role=REQUESTER&isActive=true', admin.body.userAccounts.activeRequesters],
      ['/admin/users?role=IT_STAFF&isActive=true', admin.body.userAccounts.activeItStaff],
      ['/admin/users?role=ADMINISTRATOR&isActive=true', admin.body.userAccounts.activeAdministrators],
      ['/admin/users?isActive=false', admin.body.userAccounts.inactive],
    ] as Array<[string, number]>) {
      const list = await request(app).get(`/api${path}`).set('Cookie', adminCookie);
      expect(list.body, path).toHaveLength(value);
    }
  });

  it('DASH-10: a staff member with no open actions gets myOpenActions 0 and an empty list', async () => {
    const res = await dashboard(await loginAs(fx.staffB.email));
    expect(res.body.metrics.myOpenActions.value).toBe(0);
    expect(res.body.myOpenActionsList).toEqual([]);
  });

  it('DASH-11: lists hold at most 5 items, in the documented order, with only the documented fields', async () => {
    const res = await dashboard(staffCookie);
    const { myOpenActionsList, urgentTickets, recentTickets } = res.body;
    for (const list of [myOpenActionsList, urgentTickets, recentTickets]) expect(list.length).toBeLessThanOrEqual(5);
    expect(myOpenActionsList).toHaveLength(5);
    expect(urgentTickets).toHaveLength(5);

    for (const a of myOpenActionsList) {
      expect(Object.keys(a).sort()).toEqual(['actionAt', 'description', 'followUpRequired', 'id', 'status', 'ticketNumber', 'ticketSummary'].sort());
      expect(['PLANNED', 'IN_PROGRESS']).toContain(a.status);
    }
    const actionTimes = myOpenActionsList.map((a: { actionAt: string }) => a.actionAt);
    expect(actionTimes).toEqual([...actionTimes].sort());

    for (const t of urgentTickets) {
      expect(Object.keys(t).sort()).toEqual(['createdAt', 'currentStatus', 'itPriority', 'summary', 'ticketNumber', 'ticketOwner'].sort());
      expect(t.itPriority).toBe('HIGH');
      expect(ACTIVE_LIST.split(',')).toContain(t.currentStatus);
    }
    const created = urgentTickets.map((t: { createdAt: string }) => t.createdAt);
    expect(created).toEqual([...created].sort());

    for (const t of recentTickets) expect(Object.keys(t).sort()).toEqual(['currentStatus', 'summary', 'ticketNumber', 'updatedAt'].sort());
    for (let i = 1; i < recentTickets.length; i++) {
      const [prev, cur] = [recentTickets[i - 1], recentTickets[i]];
      expect(prev.updatedAt > cur.updatedAt || (prev.updatedAt === cur.updatedAt && prev.ticketNumber > cur.ticketNumber)).toBe(true);
    }
  });

  it('DASH-12: awaitingReview counts active Tickets with requesterIndicatedResolved only', async () => {
    const res = await dashboard(staffCookie);
    const active = await sql(`SELECT count(*)::int AS n FROM "Ticket" WHERE "requesterIndicatedResolved" AND "currentStatus" IN ${ACTIVE}`);
    const any = await sql(`SELECT count(*)::int AS n FROM "Ticket" WHERE "requesterIndicatedResolved"`);
    expect(res.body.metrics.awaitingReview.value).toBe(active);
    expect(any).toBeGreaterThan(active); // the CLOSED flagged fixture is not counted
  });
});
