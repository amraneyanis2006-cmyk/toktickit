import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { hashPassword } from '../../src/utils/password';

const prisma = new PrismaClient();

const REQUESTER_A_PASSWORD = 'RequesterAPass1!';
const REQUESTER_B_PASSWORD = 'RequesterBPass1!';
const STAFF_PASSWORD = 'StaffPass1!';

let requesterAId: number;
let requesterBId: number;
let staffId: number;
let categoryId: number;
let relatedSystemId: number;
let ticketNumber: string;

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
  const [requesterA, requesterB, staff, category, relatedSystem] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Regression Requester A',
        email: 'rr16-requester-a@example.com',
        role: 'REQUESTER',
        isActive: true,
        mustChangePassword: false,
        passwordHash: await hashPassword(REQUESTER_A_PASSWORD),
      },
    }),
    prisma.user.create({
      data: {
        name: 'Regression Requester B',
        email: 'rr16-requester-b@example.com',
        role: 'REQUESTER',
        isActive: true,
        mustChangePassword: false,
        passwordHash: await hashPassword(REQUESTER_B_PASSWORD),
      },
    }),
    prisma.user.create({
      data: {
        name: 'Regression IT Staff',
        email: 'rr16-staff@example.com',
        role: 'IT_STAFF',
        isActive: true,
        mustChangePassword: false,
        passwordHash: await hashPassword(STAFF_PASSWORD),
      },
    }),
    prisma.category.create({ data: { name: 'RR16 Test Category' } }),
    prisma.relatedSystem.create({ data: { name: 'RR16 Test System' } }),
  ]);

  requesterAId = requesterA.id;
  requesterBId = requesterB.id;
  staffId = staff.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
});

afterAll(async () => {
  await prisma.ticketComment.deleteMany({ where: { authorId: { in: [requesterAId, requesterBId, staffId] } } });
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [requesterAId, requesterBId] } } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.relatedSystem.delete({ where: { id: relatedSystemId } });
  await prisma.user.deleteMany({ where: { id: { in: [requesterAId, requesterBId, staffId] } } });
  await prisma.$disconnect();
});

describe('MIG-04: x-requester-id header is fully removed', () => {
  it('a request with only the old header (no session) is 401, not treated as an implicit identity', async () => {
    const res = await request(app).get('/api/tickets').set('x-requester-id', String(requesterAId));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('NOT_AUTHENTICATED');
  });
});

describe('POST /api/tickets (session-scoped, API-10)', () => {
  it('creates a ticket owned by the session user, ignoring any client-supplied requesterId', async () => {
    const cookie = await loginAs('rr16-requester-a@example.com', REQUESTER_A_PASSWORD);

    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send({
        categoryId,
        relatedSystemId,
        requestedPriority: 'MEDIUM',
        summary: 'Regression test ticket for Lab 3 migration',
        description: 'Created by requester-regression.api.test.ts to verify session-based ownership.',
        requesterId: requesterBId, // forged - must be ignored (BR-07)
      });

    expect(res.status).toBe(201);
    expect(res.body.requesterId).toBe(requesterAId);
    ticketNumber = res.body.ticketNumber;
  });

  it('rejects an IT Staff session with 403 FORBIDDEN (Requester-only route)', async () => {
    const cookie = await loginAs('rr16-staff@example.com', STAFF_PASSWORD);

    const res = await request(app)
      .post('/api/tickets')
      .set('Cookie', cookie)
      .send({
        categoryId,
        relatedSystemId,
        requestedPriority: 'LOW',
        summary: 'Should be rejected',
        description: 'IT Staff should not be able to create Requester tickets via this route.',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
});

describe('GET /api/tickets and /api/tickets/:ticketNumber (API-12 continuity)', () => {
  it('lists only the session user\'s own tickets', async () => {
    const cookie = await loginAs('rr16-requester-a@example.com', REQUESTER_A_PASSWORD);
    const res = await request(app).get('/api/tickets').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.some((t: { ticketNumber: string }) => t.ticketNumber === ticketNumber)).toBe(true);
  });

  it('returns the ticket detail for its owner', async () => {
    const cookie = await loginAs('rr16-requester-a@example.com', REQUESTER_A_PASSWORD);
    const res = await request(app).get(`/api/tickets/${ticketNumber}`).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.ticketNumber).toBe(ticketNumber);
  });

  it('returns 404 for a different Requester (BR-26/BR-27, identical to not-found)', async () => {
    const cookie = await loginAs('rr16-requester-b@example.com', REQUESTER_B_PASSWORD);
    const res = await request(app).get(`/api/tickets/${ticketNumber}`).set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND', message: 'Ticket not found.' });
  });
});

describe('POST /api/tickets/:ticketNumber/comments (API-13/14/15/16)', () => {
  it('API-13: the owning Requester can post a Public Comment', async () => {
    const cookie = await loginAs('rr16-requester-a@example.com', REQUESTER_A_PASSWORD);
    const res = await request(app)
      .post(`/api/tickets/${ticketNumber}/comments`)
      .set('Cookie', cookie)
      .send({ content: 'Still happening after a restart.' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ticketId: expect.any(Number),
      authorId: requesterAId,
      authorName: 'Regression Requester A',
      authorRole: 'REQUESTER',
      content: 'Still happening after a restart.',
    });
    expect(res.body.createdAt).toBeDefined();
  });

  it('API-14: IT Staff can post a Public Comment on any ticket (not just owned ones)', async () => {
    const cookie = await loginAs('rr16-staff@example.com', STAFF_PASSWORD);
    const res = await request(app)
      .post(`/api/tickets/${ticketNumber}/comments`)
      .set('Cookie', cookie)
      .send({ content: 'Looking into this now.' });

    expect(res.status).toBe(201);
    expect(res.body.authorRole).toBe('IT_STAFF');
  });

  it('API-15: rejects empty/whitespace-only content', async () => {
    const cookie = await loginAs('rr16-requester-a@example.com', REQUESTER_A_PASSWORD);
    const res = await request(app)
      .post(`/api/tickets/${ticketNumber}/comments`)
      .set('Cookie', cookie)
      .send({ content: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('API-15: rejects content over 2000 characters', async () => {
    const cookie = await loginAs('rr16-requester-a@example.com', REQUESTER_A_PASSWORD);
    const res = await request(app)
      .post(`/api/tickets/${ticketNumber}/comments`)
      .set('Cookie', cookie)
      .send({ content: 'x'.repeat(2001) });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('a non-owning Requester gets 404, not the comment thread (BR-26)', async () => {
    const cookie = await loginAs('rr16-requester-b@example.com', REQUESTER_B_PASSWORD);
    const res = await request(app)
      .post(`/api/tickets/${ticketNumber}/comments`)
      .set('Cookie', cookie)
      .send({ content: 'Should not be allowed.' });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/tickets/:ticketNumber/resolved-indication (API-18)', () => {
  it('sets requesterIndicatedResolved=true without changing currentStatus', async () => {
    const cookie = await loginAs('rr16-requester-a@example.com', REQUESTER_A_PASSWORD);

    const res = await request(app)
      .patch(`/api/tickets/${ticketNumber}/resolved-indication`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ticketNumber, requesterIndicatedResolved: true });

    const detail = await request(app).get(`/api/tickets/${ticketNumber}`).set('Cookie', cookie);
    expect(detail.body.currentStatus).toBe('NEW');
  });

  it('is idempotent (calling it again still returns true)', async () => {
    const cookie = await loginAs('rr16-requester-a@example.com', REQUESTER_A_PASSWORD);
    const res = await request(app)
      .patch(`/api/tickets/${ticketNumber}/resolved-indication`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.requesterIndicatedResolved).toBe(true);
  });

  it('rejects a non-owner with 404', async () => {
    const cookie = await loginAs('rr16-requester-b@example.com', REQUESTER_B_PASSWORD);
    const res = await request(app)
      .patch(`/api/tickets/${ticketNumber}/resolved-indication`)
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
  });

  it('rejects an IT Staff session with 403 (Requester-only action)', async () => {
    const cookie = await loginAs('rr16-staff@example.com', STAFF_PASSWORD);
    const res = await request(app)
      .patch(`/api/tickets/${ticketNumber}/resolved-indication`)
      .set('Cookie', cookie);

    expect(res.status).toBe(403);
  });
});
