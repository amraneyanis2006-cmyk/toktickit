import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app'; // ajuste ce chemin si ton export Express diffère

const prisma = new PrismaClient();

describe('GET /api/tickets/:ticketNumber', () => {
  let requesterA: { id: number };
  let requesterB: { id: number };
  let categoryId: number;
  let relatedSystemId: number;
  let ownedTicketNumber: string;

  beforeAll(async () => {
    // Requesters de test (email unique pour éviter les collisions entre runs)
    requesterA = await prisma.requesterUser.create({
      data: { name: 'Test Requester A', email: `req-a-${Date.now()}@test.local`, isActive: true },
    });
    requesterB = await prisma.requesterUser.create({
      data: { name: 'Test Requester B', email: `req-b-${Date.now()}@test.local`, isActive: true },
    });

    const category = await prisma.category.findFirst({ where: { isActive: true } });
    const system = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
    categoryId = category!.id;
    relatedSystemId = system!.id;

    // Ticket créé par Requester A, via l'API pour rester réaliste
    const res = await request(app)
      .post('/api/tickets')
      .set('x-requester-id', String(requesterA.id))
      .send({
        categoryId,
        relatedSystemId,
        requestedPriority: 'MEDIUM',
        summary: 'Test ticket for detail lookup',
        description: 'Description long enough to pass validation rules.',
      });

    ownedTicketNumber = res.body.ticketNumber;
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { requesterId: { in: [requesterA.id, requesterB.id] } } });
    await prisma.requesterUser.deleteMany({ where: { id: { in: [requesterA.id, requesterB.id] } } });
    await prisma.$disconnect();
  });

  // API-14
  it('API-14: returns full detail for a Ticket owned by the current Requester, including empty attachments array', async () => {
    const res = await request(app)
      .get(`/api/tickets/${ownedTicketNumber}`)
      .set('x-requester-id', String(requesterA.id));

    expect(res.status).toBe(200);
    expect(res.body.ticketNumber).toBe(ownedTicketNumber);
    expect(res.body.requesterId).toBe(requesterA.id);
    expect(res.body.category).toHaveProperty('name');
    expect(res.body.relatedSystem).toHaveProperty('name');
    expect(Array.isArray(res.body.attachments)).toBe(true);
  });

  // API-13
  it('API-13: returns 404 (not 403) when the Ticket belongs to a different Requester', async () => {
    const res = await request(app)
      .get(`/api/tickets/${ownedTicketNumber}`)
      .set('x-requester-id', String(requesterB.id));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 404 for a ticketNumber that does not exist at all', async () => {
    const res = await request(app)
      .get('/api/tickets/TKT-2026-999999')
      .set('x-requester-id', String(requesterA.id));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 401 MISSING_REQUESTER when x-requester-id header is absent', async () => {
    const res = await request(app).get(`/api/tickets/${ownedTicketNumber}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('MISSING_REQUESTER');
  });
});
