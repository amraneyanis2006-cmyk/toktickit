import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { hashPassword } from '../../src/utils/password';

const prisma = new PrismaClient();

const STAFF_PASSWORD = 'StaffQueuePass1!';
const REQUESTER_PASSWORD = 'RequesterQueuePass1!';

let staffAId: number;
let staffBId: number;
let requesterId: number;
let categoryId: number;
let relatedSystemId: number;

function requireCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const cookie = Array.isArray(raw) ? raw[0] : raw;
  if (!cookie || typeof cookie !== 'string') {
    throw new Error('Expected a Set-Cookie header on the response');
  }
  return cookie;
}

async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return requireCookie(res);
}

beforeAll(async () => {
  const [staffA, staffB, requester, category, relatedSystem] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Queue Test Staff A',
        email: 'sq17-staff-a@example.com',
        role: 'IT_STAFF',
        isActive: true,
        mustChangePassword: false,
        passwordHash: await hashPassword(STAFF_PASSWORD),
      },
    }),
    prisma.user.create({
      data: {
        name: 'Queue Test Staff B',
        email: 'sq17-staff-b@example.com',
        role: 'IT_STAFF',
        isActive: true,
        mustChangePassword: false,
        passwordHash: await hashPassword(STAFF_PASSWORD),
      },
    }),
    prisma.user.create({
      data: {
        name: 'Queue Test Requester',
        email: 'sq17-requester@example.com',
        role: 'REQUESTER',
        isActive: true,
        mustChangePassword: false,
        passwordHash: await hashPassword(REQUESTER_PASSWORD),
      },
    }),
    prisma.category.create({ data: { name: 'SQ17 Test Category' } }),
    prisma.relatedSystem.create({ data: { name: 'SQ17 Test System' } }),
  ]);

  staffAId = staffA.id;
  staffBId = staffB.id;
  requesterId = requester.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;

  // Three tickets: one owned by staffA, one unassigned, one owned by staffB -
  // enough to exercise cross-Requester visibility and every ownership filter.
  await prisma.ticket.createMany({
    data: [
      {
        ticketNumber: 'TKT-SQ17-000001',
        requesterId,
        ticketOwnerId: staffAId,
        categoryId,
        relatedSystemId,
        summary: 'SQ17 owned by staff A',
        description: 'Fixture ticket for staff queue tests, owned by staff A.',
        requestedPriority: 'HIGH',
        itPriority: 'HIGH',
        currentStatus: 'IN_PROGRESS',
      },
      {
        ticketNumber: 'TKT-SQ17-000002',
        requesterId,
        ticketOwnerId: null,
        categoryId,
        relatedSystemId,
        summary: 'SQ17 unassigned ticket',
        description: 'Fixture ticket for staff queue tests, unassigned.',
        requestedPriority: 'LOW',
        itPriority: null,
        currentStatus: 'NEW',
      },
      {
        ticketNumber: 'TKT-SQ17-000003',
        requesterId,
        ticketOwnerId: staffBId,
        categoryId,
        relatedSystemId,
        summary: 'SQ17 owned by staff B',
        description: 'Fixture ticket for staff queue tests, owned by staff B.',
        requestedPriority: 'MEDIUM',
        itPriority: 'MEDIUM',
        currentStatus: 'OPEN',
      },
      {
        ticketNumber: 'TKT-SQ17-000004',
        requesterId,
        ticketOwnerId: null,
        categoryId,
        relatedSystemId,
        summary: 'SQ17 requested HIGH but itPriority LOW',
        description: 'Proves the priority filter reads itPriority, not requestedPriority.',
        requestedPriority: 'HIGH',
        itPriority: 'LOW',
        currentStatus: 'NEW',
      },
    ],
  });
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: 'TKT-SQ17-' } } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.relatedSystem.delete({ where: { id: relatedSystemId } });
  await prisma.user.deleteMany({ where: { id: { in: [staffAId, staffBId, requesterId] } } });
  await prisma.$disconnect();
});

describe('GET /api/staff/tickets (API-19, BR-18)', () => {
  it('rejects a Requester session with 403 FORBIDDEN', async () => {
    const cookie = await loginAs('sq17-requester@example.com', REQUESTER_PASSWORD);
    const res = await request(app).get('/api/staff/tickets').set('Cookie', cookie);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('API-20/BR-17: returns tickets across all Requesters/owners for an IT Staff session', async () => {
    const cookie = await loginAs('sq17-staff-a@example.com', STAFF_PASSWORD);
    const res = await request(app)
      .get('/api/staff/tickets')
      .query({ search: 'SQ17' })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const numbers = res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    expect(numbers).toEqual(
      expect.arrayContaining(['TKT-SQ17-000001', 'TKT-SQ17-000002', 'TKT-SQ17-000003'])
    );
  });

  it('filters by status', async () => {
    const cookie = await loginAs('sq17-staff-a@example.com', STAFF_PASSWORD);
    const res = await request(app)
      .get('/api/staff/tickets')
      .query({ search: 'SQ17', status: 'OPEN' })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      'TKT-SQ17-000003',
    ]);
  });

  it('filters by priority (itPriority, not requestedPriority)', async () => {
    const cookie = await loginAs('sq17-staff-a@example.com', STAFF_PASSWORD);
    const res = await request(app)
      .get('/api/staff/tickets')
      .query({ search: 'SQ17', priority: 'HIGH' })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const numbers = res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    // TKT-SQ17-000001 has itPriority HIGH - matches.
    expect(numbers).toContain('TKT-SQ17-000001');
    // TKT-SQ17-000004 has requestedPriority HIGH but itPriority LOW - must NOT match,
    // otherwise this test would pass even if the filter read the wrong field.
    expect(numbers).not.toContain('TKT-SQ17-000004');
  });

  it('ownership=mine returns only the acting staff member\'s tickets', async () => {
    const cookie = await loginAs('sq17-staff-a@example.com', STAFF_PASSWORD);
    const res = await request(app)
      .get('/api/staff/tickets')
      .query({ search: 'SQ17', ownership: 'mine' })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      'TKT-SQ17-000001',
    ]);
  });

  it('ownership=unassigned returns only tickets with no owner', async () => {
    const cookie = await loginAs('sq17-staff-a@example.com', STAFF_PASSWORD);
    const res = await request(app)
      .get('/api/staff/tickets')
      .query({ search: 'SQ17', ownership: 'unassigned' })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual(
      expect.arrayContaining(['TKT-SQ17-000002', 'TKT-SQ17-000004'])
    );
    expect(res.body.data.length).toBe(2);
  });

  it('search matches ticket number or summary, case-insensitive', async () => {
    const cookie = await loginAs('sq17-staff-a@example.com', STAFF_PASSWORD);
    const res = await request(app)
      .get('/api/staff/tickets')
      .query({ search: 'owned by staff b' })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      'TKT-SQ17-000003',
    ]);
  });

  it('pagination metadata reflects page/pageSize/totalItems/totalPages', async () => {
    const cookie = await loginAs('sq17-staff-a@example.com', STAFF_PASSWORD);
    const res = await request(app)
      .get('/api/staff/tickets')
      .query({ search: 'SQ17', pageSize: 2, page: 1 })
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 2,
      totalItems: 4,
      totalPages: 2,
    });
    expect(res.body.data.length).toBe(2);
  });

  it('AC-17: sortBy/sortDir actually change the returned order (ticketNumber asc vs desc)', async () => {
    const cookie = await loginAs('sq17-staff-a@example.com', STAFF_PASSWORD);

    const asc = await request(app)
      .get('/api/staff/tickets')
      .query({ search: 'SQ17', sortBy: 'ticketNumber', sortDir: 'asc', pageSize: 10 })
      .set('Cookie', cookie);
    const desc = await request(app)
      .get('/api/staff/tickets')
      .query({ search: 'SQ17', sortBy: 'ticketNumber', sortDir: 'desc', pageSize: 10 })
      .set('Cookie', cookie);

    expect(asc.status).toBe(200);
    expect(desc.status).toBe(200);

    const ascNumbers = asc.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);
    const descNumbers = desc.body.data.map((t: { ticketNumber: string }) => t.ticketNumber);

    expect(ascNumbers).toEqual([
      'TKT-SQ17-000001', 'TKT-SQ17-000002', 'TKT-SQ17-000003', 'TKT-SQ17-000004',
    ]);
    expect(descNumbers).toEqual([...ascNumbers].reverse());
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/staff/tickets');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('NOT_AUTHENTICATED');
  });
});
