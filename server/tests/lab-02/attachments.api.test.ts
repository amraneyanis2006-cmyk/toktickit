import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';

const prisma = new PrismaClient();

describe('POST /api/tickets/:ticketNumber/attachments', () => {
  let requesterA: { id: number };
  let requesterB: { id: number };
  let categoryId: number;
  let relatedSystemId: number;
  let ownedTicketNumber: string;

  beforeAll(async () => {
    requesterA = await prisma.requesterUser.create({
      data: { name: 'Test Requester A', email: `attach-a-${Date.now()}@test.local`, isActive: true },
    });
    requesterB = await prisma.requesterUser.create({
      data: { name: 'Test Requester B', email: `attach-b-${Date.now()}@test.local`, isActive: true },
    });

    const category = await prisma.category.findFirst({ where: { isActive: true } });
    const system = await prisma.relatedSystem.findFirst({ where: { isActive: true } });
    categoryId = category!.id;
    relatedSystemId = system!.id;

    const res = await request(app)
      .post('/api/tickets')
      .set('x-requester-id', String(requesterA.id))
      .send({
        categoryId,
        relatedSystemId,
        requestedPriority: 'MEDIUM',
        summary: 'Test ticket for attachment upload',
        description: 'Description long enough to pass validation rules.',
      });

    ownedTicketNumber = res.body.ticketNumber;
  });

  afterAll(async () => {
    await prisma.attachment.deleteMany({
      where: { ticket: { requesterId: { in: [requesterA.id, requesterB.id] } } },
    });
    await prisma.ticket.deleteMany({ where: { requesterId: { in: [requesterA.id, requesterB.id] } } });
    await prisma.requesterUser.deleteMany({ where: { id: { in: [requesterA.id, requesterB.id] } } });
    await prisma.$disconnect();
  });

  it('uploads a valid PNG and returns 201 with attachment metadata', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownedTicketNumber}/attachments`)
      .set('x-requester-id', String(requesterA.id))
      .attach('file', Buffer.from('fake-image-content'), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.originalFileName).toBe('photo.png');
    expect(res.body.mimeType).toBe('image/png');
    expect(res.body.isRemoved).toBe(false);
  });

  // API-15
  it('API-15: rejects a file over 5MB with 413 FILE_TOO_LARGE', async () => {
    const bigBuffer = Buffer.alloc(6 * 1024 * 1024, 0);

    const res = await request(app)
      .post(`/api/tickets/${ownedTicketNumber}/attachments`)
      .set('x-requester-id', String(requesterA.id))
      .attach('file', bigBuffer, { filename: 'big.png', contentType: 'image/png' });

    expect(res.status).toBe(413);
    expect(res.body.error).toBe('FILE_TOO_LARGE');
  });

  // API-16
  it('API-16: rejects an unsupported MIME type with 422 UNSUPPORTED_FILE_TYPE', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownedTicketNumber}/attachments`)
      .set('x-requester-id', String(requesterA.id))
      .attach('file', Buffer.from('not allowed'), { filename: 'file.exe', contentType: 'application/x-msdownload' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('UNSUPPORTED_FILE_TYPE');
  });

  // API-17
  it('API-17: rejects a 6th attachment on a Ticket already at 5 active attachments with 409', async () => {
    // Le ticket a déjà 1 attachment du premier test ; on en ajoute 4 pour atteindre 5.
    for (let i = 0; i < 4; i++) {
      await request(app)
        .post(`/api/tickets/${ownedTicketNumber}/attachments`)
        .set('x-requester-id', String(requesterA.id))
        .attach('file', Buffer.from('fake'), { filename: `extra-${i}.png`, contentType: 'image/png' });
    }

    const res = await request(app)
      .post(`/api/tickets/${ownedTicketNumber}/attachments`)
      .set('x-requester-id', String(requesterA.id))
      .attach('file', Buffer.from('fake'), { filename: 'sixth.png', contentType: 'image/png' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ATTACHMENT_LIMIT_REACHED');
  });

  // API-18
  it('API-18: returns 404 NOT_FOUND when the Ticket belongs to a different Requester', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownedTicketNumber}/attachments`)
      .set('x-requester-id', String(requesterB.id))
      .attach('file', Buffer.from('fake'), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR when no file is provided', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ownedTicketNumber}/attachments`)
      .set('x-requester-id', String(requesterA.id));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});