import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';

const prisma = new PrismaClient();

describe('POST /api/tickets', () => {
  let testRequesterId: number;
  let testCategoryId: number;
  let testSystemId: number;

  let inactiveRequesterId: number;

  beforeAll(async () => {
    // Récupérer un requester actif, une catégorie, et un système pour les tests
    const requester = await prisma.requesterUser.findFirst({
      where: { isActive: true },
    });
    const category = await prisma.category.findFirst({
      where: { isActive: true },
    });
    const system = await prisma.relatedSystem.findFirst({
      where: { isActive: true },
    });

    testRequesterId = requester!.id;
    testCategoryId = category!.id;
    testSystemId = system!.id;

    const inactiveRequester = await prisma.requesterUser.create({
      data: { name: 'Inactive Test Requester', email: `inactive-${Date.now()}@test.local`, isActive: false },
    });
    inactiveRequesterId = inactiveRequester.id;
  });

  afterAll(async () => {
    await prisma.requesterUser.delete({ where: { id: inactiveRequesterId } });
    await prisma.$disconnect();
  });

  it('API-01: should create a ticket with valid data', async () => {
    const response = await request(app)
      .post('/api/tickets')
      .set('x-requester-id', String(testRequesterId))
      .send({
        categoryId: testCategoryId,
        relatedSystemId: testSystemId,
        requestedPriority: 'MEDIUM',
        summary: 'Laptop battery drains quickly',
        description: 'My laptop battery is draining much faster than usual.',
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('ticketNumber');
    expect(response.body.ticketNumber).toMatch(/TKT-\d{4}-\d{6}/);
    expect(response.body.currentStatus).toBe('NEW');
    expect(response.body.requesterId).toBe(testRequesterId);
  });

  it('API-02: should reject missing summary', async () => {
    const response = await request(app)
      .post('/api/tickets')
      .set('x-requester-id', String(testRequesterId))
      .send({
        categoryId: testCategoryId,
        relatedSystemId: testSystemId,
        requestedPriority: 'MEDIUM',
        description: 'Valid description',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
    expect(response.body.fields).toHaveProperty('summary');
  });

  it('API-05: should reject missing x-requester-id header', async () => {
    const response = await request(app)
      .post('/api/tickets')
      .send({
        categoryId: testCategoryId,
        relatedSystemId: testSystemId,
        requestedPriority: 'MEDIUM',
        summary: 'Valid summary',
        description: 'Valid description',
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('MISSING_REQUESTER');
  });

  it('API-06: rejects Ticket creation for an inactive Requester, no Ticket created', async () => {
    const countBefore = await prisma.ticket.count({ where: { requesterId: inactiveRequesterId } });

    const response = await request(app)
      .post('/api/tickets')
      .set('x-requester-id', String(inactiveRequesterId))
      .send({
        categoryId: testCategoryId,
        relatedSystemId: testSystemId,
        requestedPriority: 'MEDIUM',
        summary: 'Should not be created',
        description: 'This request must be rejected before persistence.',
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('REQUESTER_INACTIVE');

    const countAfter = await prisma.ticket.count({ where: { requesterId: inactiveRequesterId } });
    expect(countAfter).toBe(countBefore); // BR-25: no Ticket created
  });
});
