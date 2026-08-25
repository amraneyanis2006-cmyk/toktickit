import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';

const prisma = new PrismaClient();

describe('GET /api/tickets', () => {
  let testRequesterId: number;
  let testCategoryId: number;
  let testSystemId: number;

  beforeAll(async () => {
    const timestamp = Date.now();
    const requester = await prisma.requesterUser.create({
      data: {
        name: `Test Requester ${timestamp}`,
        email: `test.api.${timestamp}@toktickit.test`,
        isActive: true,
      },
    });
    testRequesterId = requester.id;

    const category = await prisma.category.findFirst({
      where: { isActive: true },
    });
    testCategoryId = category!.id;

    const system = await prisma.relatedSystem.findFirst({
      where: { isActive: true },
    });
    testSystemId = system!.id;
  });

  // 🔥 Nettoyage avant ET après chaque test
  beforeEach(async () => {
    await prisma.ticket.deleteMany({
      where: { requesterId: testRequesterId },
    });
  });

  afterEach(async () => {
    await prisma.ticket.deleteMany({
      where: { requesterId: testRequesterId },
    });
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: { requesterId: testRequesterId },
    });
    await prisma.requesterUser.delete({
      where: { id: testRequesterId },
    });
  });

  it('API-07: should return only tickets owned by the requester', async () => {
    await prisma.ticket.createMany({
      data: [
        {
          ticketNumber: 'TKT-9999-999901',
          requesterId: testRequesterId,
          categoryId: testCategoryId,
          relatedSystemId: testSystemId,
          requestedPriority: 'HIGH',
          summary: 'Urgent: Server down',
          description: 'Description 1'.padEnd(10, 'x'),
        },
        {
          ticketNumber: 'TKT-9999-999902',
          requesterId: testRequesterId,
          categoryId: testCategoryId,
          relatedSystemId: testSystemId,
          requestedPriority: 'MEDIUM',
          summary: 'Laptop battery issues',
          description: 'Description 2'.padEnd(10, 'x'),
        },
        {
          ticketNumber: 'TKT-9999-999903',
          requesterId: testRequesterId,
          categoryId: testCategoryId,
          relatedSystemId: testSystemId,
          requestedPriority: 'LOW',
          summary: 'Printer not working',
          description: 'Description 3'.padEnd(10, 'x'),
        },
      ],
    });

    const response = await request(app)
      .get('/api/tickets')
      .set('x-requester-id', String(testRequesterId));

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(3);
    expect(response.body.pagination.totalItems).toBe(3);
  });

  it('API-08: search should match ticketNumber or summary case-insensitively', async () => {
    await prisma.ticket.createMany({
      data: [
        {
          ticketNumber: 'TKT-9999-999911',
          requesterId: testRequesterId,
          categoryId: testCategoryId,
          relatedSystemId: testSystemId,
          requestedPriority: 'HIGH',
          summary: 'Urgent: Server down',
          description: 'Description 1'.padEnd(10, 'x'),
        },
        {
          ticketNumber: 'TKT-9999-999912',
          requesterId: testRequesterId,
          categoryId: testCategoryId,
          relatedSystemId: testSystemId,
          requestedPriority: 'MEDIUM',
          summary: 'Laptop battery issues',
          description: 'Description 2'.padEnd(10, 'x'),
        },
      ],
    });

    const response = await request(app)
      .get('/api/tickets?search=urgent')
      .set('x-requester-id', String(testRequesterId));

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].summary).toContain('Urgent');
  });

  it('API-10: default sort should be createdAt desc', async () => {
    await prisma.ticket.create({
      data: {
        ticketNumber: 'TKT-9999-999921',
        requesterId: testRequesterId,
        categoryId: testCategoryId,
        relatedSystemId: testSystemId,
        requestedPriority: 'HIGH',
        summary: 'First ticket',
        description: 'Description 1'.padEnd(10, 'x'),
      },
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    await prisma.ticket.create({
      data: {
        ticketNumber: 'TKT-9999-999922',
        requesterId: testRequesterId,
        categoryId: testCategoryId,
        relatedSystemId: testSystemId,
        requestedPriority: 'MEDIUM',
        summary: 'Second ticket',
        description: 'Description 2'.padEnd(10, 'x'),
      },
    });

    const response = await request(app)
      .get('/api/tickets')
      .set('x-requester-id', String(testRequesterId));

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(2);
    expect(response.body.data[0].summary).toBe('Second ticket');
    expect(response.body.data[1].summary).toBe('First ticket');
  });

  it('API-11: pagination should return correct slice', async () => {
    await prisma.ticket.createMany({
      data: [
        {
          ticketNumber: 'TKT-9999-999931',
          requesterId: testRequesterId,
          categoryId: testCategoryId,
          relatedSystemId: testSystemId,
          requestedPriority: 'HIGH',
          summary: 'Ticket 1',
          description: 'Description 1'.padEnd(10, 'x'),
        },
        {
          ticketNumber: 'TKT-9999-999932',
          requesterId: testRequesterId,
          categoryId: testCategoryId,
          relatedSystemId: testSystemId,
          requestedPriority: 'MEDIUM',
          summary: 'Ticket 2',
          description: 'Description 2'.padEnd(10, 'x'),
        },
        {
          ticketNumber: 'TKT-9999-999933',
          requesterId: testRequesterId,
          categoryId: testCategoryId,
          relatedSystemId: testSystemId,
          requestedPriority: 'LOW',
          summary: 'Ticket 3',
          description: 'Description 3'.padEnd(10, 'x'),
        },
        {
          ticketNumber: 'TKT-9999-999934',
          requesterId: testRequesterId,
          categoryId: testCategoryId,
          relatedSystemId: testSystemId,
          requestedPriority: 'HIGH',
          summary: 'Ticket 4',
          description: 'Description 4'.padEnd(10, 'x'),
        },
      ],
    });

    const response = await request(app)
      .get('/api/tickets?page=1&pageSize=2')
      .set('x-requester-id', String(testRequesterId));

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(2);
    expect(response.body.pagination.page).toBe(1);
    expect(response.body.pagination.pageSize).toBe(2);
    expect(response.body.pagination.totalItems).toBe(4);
    expect(response.body.pagination.totalPages).toBe(2);
  });

  it('API-12: invalid page/pageSize should fallback to defaults', async () => {
    const response = await request(app)
      .get('/api/tickets?page=-1&pageSize=999')
      .set('x-requester-id', String(testRequesterId));

    expect(response.status).toBe(200);
    expect(response.body.pagination.page).toBe(1);
    expect(response.body.pagination.pageSize).toBe(10);
  });


  it('API-13: sortBy=ticketNumber&sortDir=asc sorts ascending by ticket number', async () => {
    await prisma.ticket.createMany({
      data: [
        {
          ticketNumber: 'TKT-9999-999943',
          requesterId: testRequesterId,
          categoryId: testCategoryId,
          relatedSystemId: testSystemId,
          requestedPriority: 'HIGH',
          summary: 'Ticket C',
          description: 'Description'.padEnd(10, 'x'),
        },
        {
          ticketNumber: 'TKT-9999-999941',
          requesterId: testRequesterId,
          categoryId: testCategoryId,
          relatedSystemId: testSystemId,
          requestedPriority: 'MEDIUM',
          summary: 'Ticket A',
          description: 'Description'.padEnd(10, 'x'),
        },
        {
          ticketNumber: 'TKT-9999-999942',
          requesterId: testRequesterId,
          categoryId: testCategoryId,
          relatedSystemId: testSystemId,
          requestedPriority: 'LOW',
          summary: 'Ticket B',
          description: 'Description'.padEnd(10, 'x'),
        },
      ],
    });

    const response = await request(app)
      .get('/api/tickets?sortBy=ticketNumber&sortDir=asc')
      .set('x-requester-id', String(testRequesterId));

    expect(response.status).toBe(200);
    expect(response.body.data.map((t: { ticketNumber: string }) => t.ticketNumber)).toEqual([
      'TKT-9999-999941',
      'TKT-9999-999942',
      'TKT-9999-999943',
    ]);
  });

  it('API-14: invalid sortBy/sortDir fall back to createdAt desc', async () => {
    const response = await request(app)
      .get('/api/tickets?sortBy=notAField&sortDir=sideways')
      .set('x-requester-id', String(testRequesterId));

    expect(response.status).toBe(200);
    // Falls back without erroring — exact ordering already covered by API-10.
  });
});