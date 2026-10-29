import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { createFixture, cleanupPrefix, createTicket, loginAs, FIXTURE_PASSWORD } from './fixtures';
import type { Lab4Fixture } from './fixtures';

const prisma = new PrismaClient();
const PREFIX = 'l4dr';
const DAY = 24 * 60 * 60 * 1000;
const ACTIVE = `('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')`;

let fx: Lab4Fixture;
let cookieA: string;

const dashboard = (cookie: string, query = '') => request(app).get(`/api/dashboard/requester${query}`).set('Cookie', cookie);

async function sqlCount(sql: string, requesterId: number) {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "Ticket" WHERE "requesterId" = $1 AND ${sql}`, requesterId);
  return rows[0]!.n;
}

beforeAll(async () => {
  fx = await createFixture(prisma, PREFIX);
  const a = fx.requesterA.id;
  const b = fx.requesterB.id;
  // Requester A: every metric non-zero, plus tickets that must NOT count.
  await createTicket(prisma, fx, { requesterId: a, status: 'NEW' });
  await createTicket(prisma, fx, { requesterId: a, status: 'IN_PROGRESS' });
  await createTicket(prisma, fx, { requesterId: a, status: 'WAITING_FOR_REQUESTER' });
  await createTicket(prisma, fx, { requesterId: a, status: 'WAITING_FOR_REQUESTER' });
  await createTicket(prisma, fx, { requesterId: a, status: 'RESOLVED', resolvedAt: new Date(Date.now() - 6 * DAY) });
  await createTicket(prisma, fx, { requesterId: a, status: 'RESOLVED', resolvedAt: new Date(Date.now() - 8 * DAY) });
  await createTicket(prisma, fx, { requesterId: a, status: 'CLOSED', resolvedAt: new Date(Date.now() - 2 * DAY) });
  await createTicket(prisma, fx, { requesterId: a, status: 'CANCELLED' });
  // Requester B: different numbers.
  await createTicket(prisma, fx, { requesterId: b, status: 'OPEN' });
  await createTicket(prisma, fx, { requesterId: b, status: 'CLOSED', resolvedAt: new Date(Date.now() - 30 * DAY) });
  cookieA = await loginAs(fx.requesterA.email);
});

afterAll(async () => {
  await cleanupPrefix(prisma, PREFIX);
  await prisma.$disconnect();
});

describe('GET /api/dashboard/requester', () => {
  it('DASH-01: each Requester gets only their own counts and tickets; a requesterId query parameter is ignored', async () => {
    const a = await dashboard(cookieA);
    const b = await dashboard(await loginAs(fx.requesterB.email));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.metrics.openTickets.value).toBe(4);
    expect(b.body.metrics.openTickets.value).toBe(1);
    for (const [res, id] of [[a, fx.requesterA.id], [b, fx.requesterB.id]] as const) {
      const own = (await prisma.ticket.findMany({ where: { requesterId: id }, select: { ticketNumber: true } })).map((t) => t.ticketNumber);
      for (const t of [...res.body.recentTickets, ...res.body.attentionTickets]) expect(own).toContain(t.ticketNumber);
    }
    expect(b.body.metrics).toMatchObject({ closedTickets: { value: 1 }, resolvedLast7Days: { value: 0 }, waitingForMe: { value: 0 } });
    expect(b.body.recentTickets).toHaveLength(2);

    const spoofed = await dashboard(cookieA, `?requesterId=${fx.requesterB.id}`);
    expect(spoofed.body.metrics).toEqual(a.body.metrics);
  });

  it('DASH-02: every metric equals the same count run with raw SQL', async () => {
    const res = await dashboard(cookieA);
    const id = fx.requesterA.id;
    expect(res.body.metrics.openTickets.value).toBe(await sqlCount(`"currentStatus" IN ${ACTIVE}`, id));
    expect(res.body.metrics.waitingForMe.value).toBe(await sqlCount(`"currentStatus" = 'WAITING_FOR_REQUESTER'`, id));
    expect(res.body.metrics.resolvedLast7Days.value).toBe(
      await sqlCount(`"currentStatus" IN ('RESOLVED','CLOSED') AND "resolvedAt" >= now() - interval '7 days'`, id)
    );
    expect(res.body.metrics.closedTickets.value).toBe(await sqlCount(`"currentStatus" = 'CLOSED'`, id));
    expect(res.body.attentionTickets).toHaveLength(await sqlCount(`"currentStatus" = 'WAITING_FOR_REQUESTER'`, id));
    expect(res.body).toMatchObject({ windowDays: 7, generatedAt: expect.any(String) });
  });

  it('DASH-03: a Requester with no Tickets gets zeros and empty lists with 200', async () => {
    const email = `${fx.tag}-empty@example.com`;
    await prisma.user.create({
      data: { name: 'Lab4 Empty Requester', email, role: 'REQUESTER', passwordHash: await bcrypt.hash(FIXTURE_PASSWORD, 4) },
    });
    const res = await dashboard(await loginAs(email));
    expect(res.status).toBe(200);
    for (const key of ['openTickets', 'waitingForMe', 'resolvedLast7Days', 'closedTickets']) expect(res.body.metrics[key].value, key).toBe(0);
    expect(res.body.attentionTickets).toEqual([]);
    expect(res.body.recentTickets).toEqual([]);
  });

  it('DASH-04: the 7-day window counts a resolution 6 days ago and not one 8 days ago', async () => {
    const res = await dashboard(cookieA);
    // A: RESOLVED 6 d ago (in), RESOLVED 8 d ago (out), CLOSED 2 d ago (in).
    expect(res.body.metrics.resolvedLast7Days.value).toBe(2);
  });

  it('DASH-05: every drill-down query returns totalItems equal to its metric value', async () => {
    const res = await dashboard(cookieA);
    expect(res.body.metrics.openTickets.drillDown).toBe('/tickets?status=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED');
    expect(res.body.metrics.waitingForMe.drillDown).toBe('/tickets?status=WAITING_FOR_REQUESTER');
    expect(res.body.metrics.resolvedLast7Days.drillDown).toBe('/tickets?status=RESOLVED,CLOSED&resolvedWithinDays=7');
    expect(res.body.metrics.closedTickets.drillDown).toBe('/tickets?status=CLOSED');
    for (const [key, metric] of Object.entries(res.body.metrics as Record<string, { value: number; drillDown: string }>)) {
      const list = await request(app).get(`/api${metric.drillDown}`).set('Cookie', cookieA);
      expect(list.status, key).toBe(200);
      expect(list.body.pagination.totalItems, key).toBe(metric.value);
    }
  });

  it('DASH-06: IT Staff and Administrators get 403; no session gets 401', async () => {
    for (const email of [fx.staffA.email, fx.admin.email]) {
      const res = await dashboard(await loginAs(email));
      expect(res.status, email).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    }
    const anonymous = await request(app).get('/api/dashboard/requester');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error).toBe('NOT_AUTHENTICATED');
  });
});
