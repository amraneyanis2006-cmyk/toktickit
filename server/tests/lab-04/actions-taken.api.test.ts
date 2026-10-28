import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { createFixture, cleanupPrefix, createTicket, loginAs, actionBody } from './fixtures';
import type { Lab4Fixture } from './fixtures';

const prisma = new PrismaClient();
const PREFIX = 'l4api';

let fx: Lab4Fixture;
let staffCookie: string;
let staffBCookie: string;

const actionsUrl = (ticketNumber: string) => `/api/staff/tickets/${ticketNumber}/actions`;

async function createAction(ticketNumber: string, overrides: Record<string, unknown> = {}, cookie = staffCookie) {
  return request(app).post(actionsUrl(ticketNumber)).set('Cookie', cookie).send(actionBody(overrides));
}

beforeAll(async () => {
  fx = await createFixture(prisma, PREFIX);
  staffCookie = await loginAs(fx.staffA.email);
  staffBCookie = await loginAs(fx.staffB.email);
});

afterAll(async () => {
  await cleanupPrefix(prisma, PREFIX);
  await prisma.$disconnect();
});

describe('GET /api/staff/tickets/:ticketNumber/actions', () => {
  it('API-01: lists Actions Taken ordered by actionAt asc then id asc, identically on every call', async () => {
    const ticket = await createTicket(prisma, fx);
    const base = Date.now() - 60 * 60 * 1000;
    const at = (minutes: number) => new Date(base + minutes * 60 * 1000).toISOString();
    // Created out of chronological order, two with the same actionAt.
    const c = await createAction(ticket.ticketNumber, { actionAt: at(30), description: 'third' });
    const a = await createAction(ticket.ticketNumber, { actionAt: at(10), description: 'first' });
    const b1 = await createAction(ticket.ticketNumber, { actionAt: at(20), description: 'second-a' });
    const b2 = await createAction(ticket.ticketNumber, { actionAt: at(20), description: 'second-b' });
    for (const r of [a, b1, b2, c]) expect(r.status).toBe(201);

    const first = await request(app).get(actionsUrl(ticket.ticketNumber)).set('Cookie', staffCookie);
    expect(first.status).toBe(200);
    expect(first.body.data.map((x: { description: string }) => x.description)).toEqual(['first', 'second-a', 'second-b', 'third']);
    expect(b1.body.id).toBeLessThan(b2.body.id);

    const second = await request(app).get(actionsUrl(ticket.ticketNumber)).set('Cookie', staffCookie);
    expect(second.body.data.map((x: { id: number }) => x.id)).toEqual(first.body.data.map((x: { id: number }) => x.id));
    expect(first.body.data[0]).not.toHaveProperty('clientRequestId');
  });
});

describe('POST /api/staff/tickets/:ticketNumber/actions', () => {
  it('API-02: rejects invalid fields with 400 VALIDATION_ERROR listing every field, and saves nothing', async () => {
    const ticket = await createTicket(prisma, fx);
    const res = await request(app)
      .post(actionsUrl(ticket.ticketNumber))
      .set('Cookie', staffCookie)
      .send({
        actionAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        description: '   ',
        result: 'r'.repeat(2001),
        followUpRequired: false,
        attachmentNotes: 'a'.repeat(501),
        clientRequestId: 'not-a-uuid',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.fields).sort()).toEqual(['actionAt', 'attachmentNotes', 'clientRequestId', 'description', 'result']);
    expect(res.body.message).toEqual(expect.any(String));
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);

    const beforeTicket = await request(app)
      .post(actionsUrl(ticket.ticketNumber))
      .set('Cookie', staffCookie)
      .send(actionBody({ actionAt: new Date(ticket.createdAt.getTime() - 24 * 60 * 60 * 1000).toISOString() }));
    expect(beforeTicket.status).toBe(400);
    expect(beforeTicket.body.fields.actionAt).toBeDefined();
  });

  it('API-03: creates a valid Action Taken under the correct Ticket and actor', async () => {
    const ticket = await createTicket(prisma, fx);
    const res = await createAction(ticket.ticketNumber, { result: null, attachmentNotes: 'See wifi-error.png' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ticketNumber: ticket.ticketNumber,
      status: 'PLANNED',
      createdBy: { id: fx.staffA.id, name: fx.staffA.name },
      performedBy: { id: fx.staffA.id, name: fx.staffA.name },
      result: null,
      followUpRequired: false,
      followUpNote: null,
      attachmentNotes: 'See wifi-error.png',
      completedAt: null,
      cancelledAt: null,
    });
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.ticketId).toBe(ticket.id);
    expect(row.createdById).toBe(fx.staffA.id);

    // An approved assignee (another active IT Staff / Administrator).
    const assigned = await createAction(ticket.ticketNumber, { performedById: fx.admin.id });
    expect(assigned.status).toBe(201);
    expect(assigned.body.performedBy.id).toBe(fx.admin.id);
    expect(assigned.body.createdBy.id).toBe(fx.staffA.id);
  });

  it('API-04: rejects an inactive or Requester assignee on create and on edit with 422 INVALID_ASSIGNEE', async () => {
    const ticket = await createTicket(prisma, fx);
    for (const performedById of [fx.inactiveStaff.id, fx.requesterA.id, 99999999]) {
      const res = await createAction(ticket.ticketNumber, { performedById });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('INVALID_ASSIGNEE');
    }
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);

    const created = await createAction(ticket.ticketNumber);
    for (const performedById of [fx.inactiveStaff.id, fx.requesterB.id]) {
      const res = await request(app)
        .patch(`${actionsUrl(ticket.ticketNumber)}/${created.body.id}`)
        .set('Cookie', staffCookie)
        .send({ expectedUpdatedAt: created.body.updatedAt, performedById });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('INVALID_ASSIGNEE');
    }
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.performedById).toBe(fx.staffA.id);
    expect(row.updatedAt.toISOString()).toBe(created.body.updatedAt);
  });

  it('API-05: requires a Follow-up Note when Follow-Up Required; stores null when not required', async () => {
    const ticket = await createTicket(prisma, fx);
    const missing = await createAction(ticket.ticketNumber, { followUpRequired: true });
    expect(missing.status).toBe(400);
    expect(missing.body.fields.followUpNote).toBeDefined();
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);

    const withNote = await createAction(ticket.ticketNumber, { followUpRequired: true, followUpNote: 'Check on Friday.' });
    expect(withNote.status).toBe(201);
    expect(withNote.body.followUpNote).toBe('Check on Friday.');

    const notRequired = await createAction(ticket.ticketNumber, { followUpRequired: false, followUpNote: 'Should be dropped' });
    expect(notRequired.status).toBe(201);
    expect(notRequired.body.followUpNote).toBeNull();
  });

  it('API-06: ignores client-supplied createdById and ticketId', async () => {
    const ticket = await createTicket(prisma, fx);
    const other = await createTicket(prisma, fx);
    const res = await createAction(ticket.ticketNumber, { createdById: fx.admin.id, ticketId: other.id });
    expect(res.status).toBe(201);
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.createdById).toBe(fx.staffA.id);
    expect(row.ticketId).toBe(ticket.id);
    expect(await prisma.actionTaken.count({ where: { ticketId: other.id } })).toBe(0);
  });
});

describe('PATCH /api/staff/tickets/:ticketNumber/actions/:actionId', () => {
  it('API-07: edits and re-assigns an open action; only supplied fields change and updatedAt changes', async () => {
    const ticket = await createTicket(prisma, fx);
    const created = await createAction(ticket.ticketNumber, { attachmentNotes: 'keep me' });
    await new Promise((r) => setTimeout(r, 5));
    const res = await request(app)
      .patch(`${actionsUrl(ticket.ticketNumber)}/${created.body.id}`)
      .set('Cookie', staffBCookie)
      .send({ expectedUpdatedAt: created.body.updatedAt, description: 'Updated description', performedById: fx.staffB.id });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Updated description');
    expect(res.body.performedBy).toEqual({ id: fx.staffB.id, name: fx.staffB.name });
    expect(res.body.createdBy.id).toBe(fx.staffA.id);
    expect(res.body.attachmentNotes).toBe('keep me');
    expect(res.body.actionAt).toBe(created.body.actionAt);
    expect(res.body.status).toBe('PLANNED');
    expect(res.body.updatedAt).not.toBe(created.body.updatedAt);
  });

  it('API-08: completing requires a Result; a COMPLETED action is locked', async () => {
    const ticket = await createTicket(prisma, fx);
    const created = await createAction(ticket.ticketNumber);
    const statusUrl = `${actionsUrl(ticket.ticketNumber)}/${created.body.id}/status`;

    const noResult = await request(app)
      .patch(statusUrl)
      .set('Cookie', staffCookie)
      .send({ status: 'COMPLETED', expectedUpdatedAt: created.body.updatedAt });
    expect(noResult.status).toBe(400);
    expect(noResult.body.fields.result).toBeDefined();

    const done = await request(app)
      .patch(statusUrl)
      .set('Cookie', staffCookie)
      .send({ status: 'COMPLETED', result: 'Fixed after reboot.', expectedUpdatedAt: created.body.updatedAt });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('COMPLETED');
    expect(done.body.result).toBe('Fixed after reboot.');
    expect(new Date(done.body.completedAt).toString()).not.toBe('Invalid Date');

    const edit = await request(app)
      .patch(`${actionsUrl(ticket.ticketNumber)}/${created.body.id}`)
      .set('Cookie', staffCookie)
      .send({ expectedUpdatedAt: done.body.updatedAt, description: 'Too late' });
    expect(edit.status).toBe(409);
    expect(edit.body.error).toBe('ACTION_LOCKED');
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.description).toBe(created.body.description);
  });

  it('API-08: completing uses an already stored Result when none is sent', async () => {
    const ticket = await createTicket(prisma, fx);
    const created = await createAction(ticket.ticketNumber, { result: 'Stored result' });
    const res = await request(app)
      .patch(`${actionsUrl(ticket.ticketNumber)}/${created.body.id}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'COMPLETED', expectedUpdatedAt: created.body.updatedAt });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('Stored result');
  });

  it('API-09: cancelling sets CANCELLED and cancelledAt; it stays listed and cannot be edited', async () => {
    const ticket = await createTicket(prisma, fx);
    const created = await createAction(ticket.ticketNumber);
    const res = await request(app)
      .patch(`${actionsUrl(ticket.ticketNumber)}/${created.body.id}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'CANCELLED', expectedUpdatedAt: created.body.updatedAt });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelledAt).not.toBeNull();
    expect(res.body.completedAt).toBeNull();

    const list = await request(app).get(actionsUrl(ticket.ticketNumber)).set('Cookie', staffCookie);
    expect(list.body.data.map((a: { id: number }) => a.id)).toContain(created.body.id);

    const edit = await request(app)
      .patch(`${actionsUrl(ticket.ticketNumber)}/${created.body.id}`)
      .set('Cookie', staffCookie)
      .send({ expectedUpdatedAt: res.body.updatedAt, result: 'nope' });
    expect(edit.status).toBe(409);
    expect(edit.body.error).toBe('ACTION_LOCKED');
  });

  it('API-10: a status change on a COMPLETED or CANCELLED action is 409 ACTION_LOCKED', async () => {
    const ticket = await createTicket(prisma, fx);
    const statusOf = (id: number) => `${actionsUrl(ticket.ticketNumber)}/${id}/status`;

    const a = await createAction(ticket.ticketNumber, { result: 'done' });
    const completed = await request(app).patch(statusOf(a.body.id)).set('Cookie', staffCookie)
      .send({ status: 'COMPLETED', expectedUpdatedAt: a.body.updatedAt });
    expect(completed.status).toBe(200);
    for (const status of ['IN_PROGRESS', 'CANCELLED', 'COMPLETED', 'PLANNED']) {
      const res = await request(app).patch(statusOf(a.body.id)).set('Cookie', staffCookie)
        .send({ status, result: 'x', expectedUpdatedAt: completed.body.updatedAt });
      expect(res.status, `COMPLETED -> ${status}`).toBe(409);
      expect(res.body.error).toBe('ACTION_LOCKED');
    }

    const b = await createAction(ticket.ticketNumber);
    const cancelled = await request(app).patch(statusOf(b.body.id)).set('Cookie', staffCookie)
      .send({ status: 'CANCELLED', expectedUpdatedAt: b.body.updatedAt });
    for (const status of ['COMPLETED', 'IN_PROGRESS']) {
      const res = await request(app).patch(statusOf(b.body.id)).set('Cookie', staffCookie)
        .send({ status, result: 'x', expectedUpdatedAt: cancelled.body.updatedAt });
      expect(res.status, `CANCELLED -> ${status}`).toBe(409);
      expect(res.body.error).toBe('ACTION_LOCKED');
    }
    const rows = await prisma.actionTaken.findMany({ where: { id: { in: [a.body.id, b.body.id] } }, orderBy: { id: 'asc' } });
    expect(rows.map((r) => r.status)).toEqual(['COMPLETED', 'CANCELLED']);
  });

  it('API-10: illegal moves between open states are 409 INVALID_ACTION_TRANSITION', async () => {
    const ticket = await createTicket(prisma, fx);
    const statusOf = (id: number) => `${actionsUrl(ticket.ticketNumber)}/${id}/status`;

    const planned = await createAction(ticket.ticketNumber);
    const samePlanned = await request(app).patch(statusOf(planned.body.id)).set('Cookie', staffCookie)
      .send({ status: 'PLANNED', expectedUpdatedAt: planned.body.updatedAt });
    expect(samePlanned.status).toBe(409);
    expect(samePlanned.body.error).toBe('INVALID_ACTION_TRANSITION');

    const started = await request(app).patch(statusOf(planned.body.id)).set('Cookie', staffCookie)
      .send({ status: 'IN_PROGRESS', expectedUpdatedAt: planned.body.updatedAt });
    expect(started.status).toBe(200);
    for (const status of ['IN_PROGRESS', 'PLANNED']) {
      const res = await request(app).patch(statusOf(planned.body.id)).set('Cookie', staffCookie)
        .send({ status, expectedUpdatedAt: started.body.updatedAt });
      expect(res.status, `IN_PROGRESS -> ${status}`).toBe(409);
      expect(res.body.error).toBe('INVALID_ACTION_TRANSITION');
    }

    const bogus = await request(app).patch(statusOf(planned.body.id)).set('Cookie', staffCookie)
      .send({ status: 'DONE', expectedUpdatedAt: started.body.updatedAt });
    expect(bogus.status).toBe(400);
  });

  it('API-11: a stale expectedUpdatedAt is rejected with 409 STALE_UPDATE and the current record; a missing token is 400', async () => {
    const ticket = await createTicket(prisma, fx);
    const created = await createAction(ticket.ticketNumber);
    const url = `${actionsUrl(ticket.ticketNumber)}/${created.body.id}`;

    const first = await request(app).patch(url).set('Cookie', staffCookie)
      .send({ expectedUpdatedAt: created.body.updatedAt, description: 'First user change' });
    expect(first.status).toBe(200);

    const second = await request(app).patch(url).set('Cookie', staffBCookie)
      .send({ expectedUpdatedAt: created.body.updatedAt, description: 'Second user change' });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('STALE_UPDATE');
    expect(second.body.current.description).toBe('First user change');
    expect(second.body.current.updatedAt).toBe(first.body.updatedAt);

    const staleStatus = await request(app).patch(`${url}/status`).set('Cookie', staffBCookie)
      .send({ status: 'CANCELLED', expectedUpdatedAt: created.body.updatedAt });
    expect(staleStatus.status).toBe(409);
    expect(staleStatus.body.error).toBe('STALE_UPDATE');

    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.description).toBe('First user change');
    expect(row.status).toBe('PLANNED');

    const noToken = await request(app).patch(url).set('Cookie', staffCookie).send({ description: 'No token' });
    expect(noToken.status).toBe(400);
    expect(noToken.body.fields.expectedUpdatedAt).toBeDefined();
    const noTokenStatus = await request(app).patch(`${url}/status`).set('Cookie', staffCookie).send({ status: 'CANCELLED' });
    expect(noTokenStatus.status).toBe(400);
    expect(noTokenStatus.body.fields.expectedUpdatedAt).toBeDefined();
  });

  it('API-11: two parallel edits with the same token - exactly one wins', async () => {
    const ticket = await createTicket(prisma, fx);
    const created = await createAction(ticket.ticketNumber);
    const url = `${actionsUrl(ticket.ticketNumber)}/${created.body.id}`;
    const [r1, r2] = await Promise.all([
      request(app).patch(url).set('Cookie', staffCookie).send({ expectedUpdatedAt: created.body.updatedAt, description: 'Parallel A' }),
      request(app).patch(url).set('Cookie', staffBCookie).send({ expectedUpdatedAt: created.body.updatedAt, description: 'Parallel B' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const winner = r1.status === 200 ? r1 : r2;
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.description).toBe(winner.body.description);
  });

  it('API-12: the same clientRequestId twice (sequential and parallel) creates exactly one row', async () => {
    const ticket = await createTicket(prisma, fx);
    // A retry re-sends exactly the same body, so build it once.
    const body = actionBody({ clientRequestId: randomUUID() });
    const send = (b = body, t = ticket.ticketNumber) =>
      request(app).post(actionsUrl(t)).set('Cookie', staffCookie).send(b);

    const first = await send();
    const replay = await send();
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);

    const parallelBody = actionBody({ clientRequestId: randomUUID() });
    const results = await Promise.all(Array.from({ length: 4 }, () => send(parallelBody)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.every((s) => s === 200 || s === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(2);

    // The same key on another Ticket is a different action.
    const other = await createTicket(prisma, fx);
    const elsewhere = await send(body, other.ticketNumber);
    expect(elsewhere.status).toBe(201);
    expect(elsewhere.body.id).not.toBe(first.body.id);
  });

  it('API-12: the same clientRequestId with a different payload is 409 IDEMPOTENCY_KEY_REUSED with the original', async () => {
    const ticket = await createTicket(prisma, fx);
    const body = actionBody({
      clientRequestId: randomUUID(),
      result: 'Partially fixed',
      followUpRequired: true,
      followUpNote: 'Check again on Friday.',
      attachmentNotes: 'wifi-error.png',
    });
    const first = await request(app).post(actionsUrl(ticket.ticketNumber)).set('Cookie', staffCookie).send(body);
    expect(first.status).toBe(201);

    const changes: Record<string, unknown> = {
      actionAt: new Date(new Date(body.actionAt as string).getTime() - 60_000).toISOString(),
      description: 'A different description',
      result: 'Different result',
      followUpRequired: false,
      followUpNote: 'A different note',
      attachmentNotes: 'other-file.png',
      performedById: fx.staffB.id,
    };
    for (const [field, value] of Object.entries(changes)) {
      const res = await request(app).post(actionsUrl(ticket.ticketNumber)).set('Cookie', staffCookie)
        .send({ ...body, [field]: value });
      expect(res.status, field).toBe(409);
      expect(res.body.error, field).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(res.body.current, field).toEqual(first.body);
    }

    // Formatting-only differences are the same payload (trimmed text, same instant).
    const sameMeaning = await request(app).post(actionsUrl(ticket.ticketNumber)).set('Cookie', staffCookie)
      .send({ ...body, description: `  ${body.description}  `, performedById: fx.staffA.id });
    expect(sameMeaning.status).toBe(200);
    expect(sameMeaning.body).toEqual(first.body);

    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: first.body.id } });
    expect(row.updatedAt.toISOString()).toBe(first.body.updatedAt);
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(1);
  });

  it('API-13: refuses to create or edit Actions Taken on a RESOLVED, CLOSED, or CANCELLED Ticket', async () => {
    for (const status of ['RESOLVED', 'CLOSED', 'CANCELLED'] as const) {
      const ticket = await createTicket(prisma, fx);
      const created = await createAction(ticket.ticketNumber);
      expect(created.status).toBe(201);
      await prisma.ticket.update({ where: { id: ticket.id }, data: { currentStatus: status } });

      const create = await createAction(ticket.ticketNumber);
      expect(create.status).toBe(409);
      expect(create.body.error).toBe('TICKET_NOT_ACTIVE');

      const edit = await request(app)
        .patch(`${actionsUrl(ticket.ticketNumber)}/${created.body.id}`)
        .set('Cookie', staffCookie)
        .send({ expectedUpdatedAt: created.body.updatedAt, description: 'Edit on inactive ticket' });
      expect(edit.status).toBe(409);
      expect(edit.body.error).toBe('TICKET_NOT_ACTIVE');

      const status409 = await request(app)
        .patch(`${actionsUrl(ticket.ticketNumber)}/${created.body.id}/status`)
        .set('Cookie', staffCookie)
        .send({ status: 'CANCELLED', expectedUpdatedAt: created.body.updatedAt });
      expect(status409.status).toBe(409);
      expect(status409.body.error).toBe('TICKET_NOT_ACTIVE');
    }
  });

  it('API-14: Actions Taken are append-only - DELETE is 404 (no route) and order is stable after an edit', async () => {
    const ticket = await createTicket(prisma, fx);
    const base = Date.now() - 30 * 60 * 1000;
    const a = await createAction(ticket.ticketNumber, { actionAt: new Date(base).toISOString(), description: 'one' });
    const b = await createAction(ticket.ticketNumber, { actionAt: new Date(base + 60000).toISOString(), description: 'two' });

    const del = await request(app).delete(`${actionsUrl(ticket.ticketNumber)}/${a.body.id}`).set('Cookie', staffCookie);
    expect(del.status).toBe(404);
    expect(del.body.error).toBe('NOT_FOUND');
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(2);

    await request(app).patch(`${actionsUrl(ticket.ticketNumber)}/${a.body.id}`).set('Cookie', staffCookie)
      .send({ expectedUpdatedAt: a.body.updatedAt, description: 'one (edited)' });
    const list = await request(app).get(actionsUrl(ticket.ticketNumber)).set('Cookie', staffCookie);
    expect(list.body.data.map((x: { id: number }) => x.id)).toEqual([a.body.id, b.body.id]);
  });
});

describe('Ticket Detail includes Actions Taken', () => {
  it('API-01: staff and owning-Requester detail return the same ordered actionsTaken', async () => {
    const ticket = await createTicket(prisma, fx);
    const base = Date.now() - 20 * 60 * 1000;
    const late = await createAction(ticket.ticketNumber, { actionAt: new Date(base + 60000).toISOString(), description: 'late' });
    const early = await createAction(ticket.ticketNumber, { actionAt: new Date(base).toISOString(), description: 'early' });

    const staff = await request(app).get(`/api/staff/tickets/${ticket.ticketNumber}`).set('Cookie', staffCookie);
    expect(staff.status).toBe(200);
    expect(staff.body.actionsTaken.map((x: { id: number }) => x.id)).toEqual([early.body.id, late.body.id]);
    expect(staff.body).toHaveProperty('resolvedAt', null);

    const requesterCookie = await loginAs(fx.requesterA.email);
    const own = await request(app).get(`/api/tickets/${ticket.ticketNumber}`).set('Cookie', requesterCookie);
    expect(own.status).toBe(200);
    expect(own.body.actionsTaken).toEqual(staff.body.actionsTaken);
    expect(own.body).not.toHaveProperty('internalNotes');
  });
});
