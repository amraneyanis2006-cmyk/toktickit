import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { hashPassword } from '../../src/utils/password';

const prisma = new PrismaClient();

const STAFF_A_PASSWORD = 'StaffOpsAPass1!';
const STAFF_B_PASSWORD = 'StaffOpsBPass1!';
const REQUESTER_PASSWORD = 'RequesterOpsPass1!';

let staffAId: number;
let staffBId: number;
let requesterId: number;
let categoryId: number;
let relatedSystemId: number;
let ticketId: number;
let ticketNumber: string;
let seq = 1;

function requireCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const cookie = Array.isArray(raw) ? raw[0] : raw;
  if (!cookie || typeof cookie !== 'string') throw new Error('Expected a Set-Cookie header');
  return cookie;
}

async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return requireCookie(res);
}

beforeEach(async () => {
  // Fresh ticket per test - claim/status/priority tests all mutate state, so
  // sharing one fixture ticket across tests would make them order-dependent.
  ticketNumber = `TKT-STO18-${String(seq++).padStart(6, '0')}`;
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: 'STO18 fixture ticket',
      description: 'Fresh fixture ticket for staff-ticket-ops tests.',
      requestedPriority: 'MEDIUM',
      currentStatus: 'NEW',
    },
  });
  ticketId = ticket.id;
});

beforeAll(async () => {
  const [staffA, staffB, requester, category, relatedSystem] = await Promise.all([
    prisma.user.create({
      data: { name: 'Ops Test Staff A', email: 'sto18-staff-a@example.com', role: 'IT_STAFF', isActive: true, mustChangePassword: false, passwordHash: await hashPassword(STAFF_A_PASSWORD) },
    }),
    prisma.user.create({
      data: { name: 'Ops Test Staff B', email: 'sto18-staff-b@example.com', role: 'IT_STAFF', isActive: true, mustChangePassword: false, passwordHash: await hashPassword(STAFF_B_PASSWORD) },
    }),
    prisma.user.create({
      data: { name: 'Ops Test Requester', email: 'sto18-requester@example.com', role: 'REQUESTER', isActive: true, mustChangePassword: false, passwordHash: await hashPassword(REQUESTER_PASSWORD) },
    }),
    prisma.category.create({ data: { name: 'STO18 Test Category' } }),
    prisma.relatedSystem.create({ data: { name: 'STO18 Test System' } }),
  ]);
  staffAId = staffA.id;
  staffBId = staffB.id;
  requesterId = requester.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
});

afterAll(async () => {
  await prisma.ticketInternalNote.deleteMany({ where: { authorId: { in: [staffAId, staffBId] } } });
  await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: 'TKT-STO18-' } } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.relatedSystem.delete({ where: { id: relatedSystemId } });
  await prisma.user.deleteMany({ where: { id: { in: [staffAId, staffBId, requesterId] } } });
  await prisma.$disconnect();
});

describe('GET /api/staff/tickets/:ticketNumber', () => {
  it('returns full detail including internalNotes for staff, regardless of ownership', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    const res = await request(app).get(`/api/staff/tickets/${ticketNumber}`).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.internalNotes).toEqual([]);
    expect(res.body.ticketOwner).toBeNull();
  });

  it('AC-16: rejects a Requester session with 403 FORBIDDEN', async () => {
    const cookie = await loginAs('sto18-requester@example.com', REQUESTER_PASSWORD);
    const res = await request(app).get(`/api/staff/tickets/${ticketNumber}`).set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent ticket', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    const res = await request(app).get('/api/staff/tickets/TKT-NOPE-999999').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/staff/tickets/:ticketNumber/claim (AC-07, BR-11, BR-12)', () => {
  it('claims an unassigned ticket', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketNumber}/claim`)
      .set('Cookie', cookie)
      .send({ ticketOwnerId: staffAId });

    expect(res.status).toBe(200);
    expect(res.body.ticketOwner).toEqual({ id: staffAId, name: 'Ops Test Staff A' });
  });

  it('reassigns an owned ticket to another active staff member', async () => {
    const cookieA = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    await request(app).patch(`/api/staff/tickets/${ticketNumber}/claim`).set('Cookie', cookieA).send({ ticketOwnerId: staffAId });

    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketNumber}/claim`)
      .set('Cookie', cookieA)
      .send({ ticketOwnerId: staffBId });

    expect(res.status).toBe(200);
    expect(res.body.ticketOwner).toEqual({ id: staffBId, name: 'Ops Test Staff B' });
  });

  it('422 INVALID_OWNER: rejects a target that is not an active IT Staff/Administrator', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketNumber}/claim`)
      .set('Cookie', cookie)
      .send({ ticketOwnerId: requesterId });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('INVALID_OWNER');
  });

  it('400: rejects a missing ticketOwnerId', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    const res = await request(app).patch(`/api/staff/tickets/${ticketNumber}/claim`).set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
  });

  it('409 OWNERSHIP_CHANGED: rejects a stale expectedUpdatedAt', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketNumber}/claim`)
      .set('Cookie', cookie)
      .send({ ticketOwnerId: staffAId, expectedUpdatedAt: '2020-01-01T00:00:00.000Z' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('OWNERSHIP_CHANGED');
  });

  it('succeeds when expectedUpdatedAt matches the current row', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });

    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketNumber}/claim`)
      .set('Cookie', cookie)
      .send({ ticketOwnerId: staffAId, expectedUpdatedAt: ticket.updatedAt.toISOString() });

    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/staff/tickets/:ticketNumber/priority (BR-13)', () => {
  it('sets a valid IT Priority', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    const res = await request(app).patch(`/api/staff/tickets/${ticketNumber}/priority`).set('Cookie', cookie).send({ itPriority: 'HIGH' });
    expect(res.status).toBe(200);
    expect(res.body.itPriority).toBe('HIGH');
  });

  it('rejects an invalid priority value', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    const res = await request(app).patch(`/api/staff/tickets/${ticketNumber}/priority`).set('Cookie', cookie).send({ itPriority: 'URGENT' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/staff/tickets/:ticketNumber/status (AC-08, BR-14, sec 4.7)', () => {
  it('AC-08: rejects an illegal transition with 409 INVALID_TRANSITION, status unchanged', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    const res = await request(app).patch(`/api/staff/tickets/${ticketNumber}/status`).set('Cookie', cookie).send({ currentStatus: 'RESOLVED' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('INVALID_TRANSITION');

    const detail = await request(app).get(`/api/staff/tickets/${ticketNumber}`).set('Cookie', cookie);
    expect(detail.body.currentStatus).toBe('NEW');
  });

  it('409 UNASSIGNED_TICKET: cannot resolve an unowned ticket', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    await request(app).patch(`/api/staff/tickets/${ticketNumber}/status`).set('Cookie', cookie).send({ currentStatus: 'IN_PROGRESS' });

    const res = await request(app).patch(`/api/staff/tickets/${ticketNumber}/status`).set('Cookie', cookie).send({ currentStatus: 'RESOLVED' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('UNASSIGNED_TICKET');
  });

  it('resolving an OWNED ticket succeeds', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    await request(app).patch(`/api/staff/tickets/${ticketNumber}/claim`).set('Cookie', cookie).send({ ticketOwnerId: staffAId });
    await request(app).patch(`/api/staff/tickets/${ticketNumber}/status`).set('Cookie', cookie).send({ currentStatus: 'IN_PROGRESS' });

    const res = await request(app).patch(`/api/staff/tickets/${ticketNumber}/status`).set('Cookie', cookie).send({ currentStatus: 'RESOLVED' });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe('RESOLVED');
  });

  it('transitioning into REOPENED resets requesterIndicatedResolved to false', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    await prisma.ticket.update({ where: { id: ticketId }, data: { requesterIndicatedResolved: true } });
    await request(app).patch(`/api/staff/tickets/${ticketNumber}/claim`).set('Cookie', cookie).send({ ticketOwnerId: staffAId });
    await request(app).patch(`/api/staff/tickets/${ticketNumber}/status`).set('Cookie', cookie).send({ currentStatus: 'IN_PROGRESS' });
    await request(app).patch(`/api/staff/tickets/${ticketNumber}/status`).set('Cookie', cookie).send({ currentStatus: 'RESOLVED' });

    const res = await request(app).patch(`/api/staff/tickets/${ticketNumber}/status`).set('Cookie', cookie).send({ currentStatus: 'REOPENED' });
    expect(res.status).toBe(200);
    expect(res.body.requesterIndicatedResolved).toBe(false);
  });

  it('a legal transition NOT into REOPENED echoes requesterIndicatedResolved unchanged', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    await prisma.ticket.update({ where: { id: ticketId }, data: { requesterIndicatedResolved: true } });

    const res = await request(app).patch(`/api/staff/tickets/${ticketNumber}/status`).set('Cookie', cookie).send({ currentStatus: 'IN_PROGRESS' });
    expect(res.status).toBe(200);
    expect(res.body.requesterIndicatedResolved).toBe(true);
  });
});

describe('POST /api/staff/tickets/:ticketNumber/notes (BR-15, BR-16, BR-27, AC-04)', () => {
  it('creates an Internal Note with server-set author and timestamp', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    const res = await request(app)
      .post(`/api/staff/tickets/${ticketNumber}/notes`)
      .set('Cookie', cookie)
      .send({ content: 'Checked known issues, nothing matching.' });

    expect(res.status).toBe(201);
    expect(res.body.authorId).toBe(staffAId);
    expect(res.body.authorName).toBe('Ops Test Staff A');
    expect(res.body.createdAt).toBeDefined();
  });

  it('rejects empty content', async () => {
    const cookie = await loginAs('sto18-staff-a@example.com', STAFF_A_PASSWORD);
    const res = await request(app).post(`/api/staff/tickets/${ticketNumber}/notes`).set('Cookie', cookie).send({ content: '   ' });
    expect(res.status).toBe(400);
  });

  it('AC-04: a Requester session is rejected with 403, never reaching note content', async () => {
    const cookie = await loginAs('sto18-requester@example.com', REQUESTER_PASSWORD);
    const res = await request(app)
      .post(`/api/staff/tickets/${ticketNumber}/notes`)
      .set('Cookie', cookie)
      .send({ content: 'A Requester should never be able to write this.' });

    expect(res.status).toBe(403);

    const notes = await prisma.ticketInternalNote.findMany({ where: { ticketId } });
    expect(notes.some((n) => n.content.includes('should never be able'))).toBe(false);
  });
});
