import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { createFixture, cleanupPrefix, createTicket, loginAs } from './fixtures';
import type { Lab4Fixture } from './fixtures';

const prisma = new PrismaClient();
const PREFIX = 'l4pf';
let fx: Lab4Fixture;

/** 95th percentile (nearest rank) of n timed calls, in ms. */
async function p95(n: number, call: () => PromiseLike<{ status: number }>) {
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    const res = await call();
    times.push(performance.now() - start);
    expect(res.status).toBe(200);
  }
  times.sort((a, b) => a - b);
  return times[Math.ceil(0.95 * times.length) - 1]!;
}

beforeAll(async () => {
  fx = await createFixture(prisma, PREFIX);
});

afterAll(async () => {
  await cleanupPrefix(prisma, PREFIX);
  await prisma.$disconnect();
});

describe('Performance smoke (AC-25)', () => {
  it('PERF-01: the Requester dashboard answers 10 calls with p95 < 500 ms', async () => {
    const cookie = await loginAs(fx.requesterA.email);
    expect(await p95(10, () => request(app).get('/api/dashboard/requester').set('Cookie', cookie))).toBeLessThan(500);
  });

  it('PERF-02: the staff dashboard (Administrator) answers 10 calls with p95 < 500 ms', async () => {
    const cookie = await loginAs(fx.admin.email);
    expect(await p95(10, () => request(app).get('/api/dashboard/staff').set('Cookie', cookie))).toBeLessThan(500);
  });

  it('PERF-03: Staff Ticket Detail with 25 Actions Taken answers in < 500 ms', async () => {
    const ticket = await createTicket(prisma, fx);
    await prisma.actionTaken.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        ticketId: ticket.id, performedById: fx.staffA.id, createdById: fx.staffA.id,
        actionAt: new Date(Date.now() - i * 60_000), description: `Perf action ${i}`, status: 'COMPLETED' as const,
      })),
    });
    const cookie = await loginAs(fx.staffA.email);
    await request(app).get(`/api/staff/tickets/${ticket.ticketNumber}`).set('Cookie', cookie); // warm-up
    const start = performance.now();
    const res = await request(app).get(`/api/staff/tickets/${ticket.ticketNumber}`).set('Cookie', cookie);
    expect(performance.now() - start).toBeLessThan(500);
    expect(res.body.actionsTaken).toHaveLength(25);
  });

  it('PERF-04: GET /api/health is unchanged and GET /api/health/db reports the database', async () => {
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok', service: 'TokTickIT API' });
    const db = await request(app).get('/api/health/db');
    expect(db.status).toBe(200);
    expect(db.body).toEqual({ database: 'ok' });
  });
});
