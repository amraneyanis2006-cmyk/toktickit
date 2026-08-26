import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import app from '../../src/app';

const prisma = new PrismaClient();
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

describe('Attachment download & remove', () => {
  let requesterA: { id: number };
  let requesterB: { id: number };
  let ticketNumber: string;
  let activeAttachmentId: number;

  beforeAll(async () => {
    requesterA = await prisma.requesterUser.create({
      data: { name: 'Test Requester A', email: `actions-a-${Date.now()}@test.local`, isActive: true },
    });
    requesterB = await prisma.requesterUser.create({
      data: { name: 'Test Requester B', email: `actions-b-${Date.now()}@test.local`, isActive: true },
    });

    const category = await prisma.category.findFirst({ where: { isActive: true } });
    const system = await prisma.relatedSystem.findFirst({ where: { isActive: true } });

    const ticketRes = await request(app)
      .post('/api/tickets')
      .set('x-requester-id', String(requesterA.id))
      .send({
        categoryId: category!.id,
        relatedSystemId: system!.id,
        requestedPriority: 'LOW',
        summary: 'Test ticket for attachment actions',
        description: 'Description long enough to pass validation rules.',
      });

    ticketNumber = ticketRes.body.ticketNumber;

    const uploadRes = await request(app)
      .post(`/api/tickets/${ticketNumber}/attachments`)
      .set('x-requester-id', String(requesterA.id))
      .attach('file', Buffer.from('fake-image-content'), { filename: 'photo.png', contentType: 'image/png' });

    activeAttachmentId = uploadRes.body.id;
  });

  afterAll(async () => {
    // clean up any files this suite actually wrote to disk
    const attachments = await prisma.attachment.findMany({
      where: { ticket: { requesterId: { in: [requesterA.id, requesterB.id] } } },
    });
    await Promise.all(
      attachments.map((a) => fs.rm(path.join(UPLOADS_DIR, a.storedFileName), { force: true }))
    );

    await prisma.attachment.deleteMany({
      where: { ticket: { requesterId: { in: [requesterA.id, requesterB.id] } } },
    });
    await prisma.ticket.deleteMany({ where: { requesterId: { in: [requesterA.id, requesterB.id] } } });
    await prisma.requesterUser.deleteMany({ where: { id: { in: [requesterA.id, requesterB.id] } } });
    await prisma.$disconnect();
  });

  it('API-19: downloads an active attachment with 200, correct headers and body', async () => {
    const res = await request(app)
      .get(`/api/attachments/${activeAttachmentId}/download`)
      .set('x-requester-id', String(requesterA.id));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-disposition']).toContain('photo.png');
    expect(res.body.toString()).toBe('fake-image-content');
  });

  it('API-20: returns 404 when downloading with a different Requester', async () => {
    const res = await request(app)
      .get(`/api/attachments/${activeAttachmentId}/download`)
      .set('x-requester-id', String(requesterB.id));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('API-21: rejects remove with a reason under 3 characters (400)', async () => {
    const res = await request(app)
      .patch(`/api/attachments/${activeAttachmentId}/remove`)
      .set('x-requester-id', String(requesterA.id))
      .send({ reason: 'ab' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('API-22: soft-removes an active attachment with 200', async () => {
    const res = await request(app)
      .patch(`/api/attachments/${activeAttachmentId}/remove`)
      .set('x-requester-id', String(requesterA.id))
      .send({ reason: 'Wrong file uploaded.' });

    expect(res.status).toBe(200);
    expect(res.body.isRemoved).toBe(true);
    expect(res.body.removalReason).toBe('Wrong file uploaded.');
    expect(res.body.removedAt).toBeTruthy();
  });

  it('API-23: returns 409 ALREADY_REMOVED on a second remove attempt', async () => {
    const res = await request(app)
      .patch(`/api/attachments/${activeAttachmentId}/remove`)
      .set('x-requester-id', String(requesterA.id))
      .send({ reason: 'Trying again.' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_REMOVED');
  });

  it('API-24: returns 404 when downloading a removed attachment (BR-21)', async () => {
    const res = await request(app)
      .get(`/api/attachments/${activeAttachmentId}/download`)
      .set('x-requester-id', String(requesterA.id));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});