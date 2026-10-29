import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { createFixture, cleanupPrefix, createTicket, loginAs, actionBody } from './fixtures';
import type { Lab4Fixture } from './fixtures';

const prisma = new PrismaClient();
const PREFIX = 'l4sec';

let fx: Lab4Fixture;
let staffCookie: string;
let ticketNumber: string;
let ticketId: number;
let action: { id: number; updatedAt: string };

const base = () => `/api/staff/tickets/${ticketNumber}/actions`;

/** Every Lab 4 Action Taken endpoint, with a body that would be valid for staff. */
function actionEndpoints() {
  return [
    { method: 'get' as const, url: base(), body: undefined },
    { method: 'post' as const, url: base(), body: actionBody() },
    { method: 'patch' as const, url: `${base()}/${action.id}`, body: { expectedUpdatedAt: action.updatedAt, description: 'x' } },
    { method: 'patch' as const, url: `${base()}/${action.id}/status`, body: { status: 'CANCELLED', expectedUpdatedAt: action.updatedAt } },
  ];
}

function send(method: 'get' | 'post' | 'patch', url: string, body: unknown, cookie?: string) {
  const req = request(app)[method](url);
  if (cookie) req.set('Cookie', cookie);
  return body === undefined ? req : req.send(body as object);
}

async function snapshot() {
  const [actions, ticket] = await Promise.all([
    prisma.actionTaken.findMany({ where: { ticketId }, orderBy: { id: 'asc' } }),
    prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
  ]);
  return JSON.stringify({ actions, status: ticket.currentStatus, updatedAt: ticket.updatedAt });
}

beforeAll(async () => {
  fx = await createFixture(prisma, PREFIX);
  staffCookie = await loginAs(fx.staffA.email);
  const ticket = await createTicket(prisma, fx, { requesterId: fx.requesterA.id });
  ticketNumber = ticket.ticketNumber;
  ticketId = ticket.id;
  const created = await request(app).post(base()).set('Cookie', staffCookie).send(actionBody({ result: 'Initial result' }));
  action = created.body;
  await prisma.ticketInternalNote.create({ data: { ticketId, authorId: fx.staffA.id, content: 'Private staff note' } });
});

afterAll(async () => {
  await cleanupPrefix(prisma, PREFIX);
  await prisma.$disconnect();
});

describe('Lab 4 authorization (backend-enforced)', () => {
  it('SEC-01: a Requester gets 403 FORBIDDEN on every Action Taken endpoint and the status endpoint; nothing changes', async () => {
    const cookie = await loginAs(fx.requesterA.email);
    const before = await snapshot();
    const calls = [
      ...actionEndpoints(),
      { method: 'patch' as const, url: `/api/staff/tickets/${ticketNumber}/status`, body: { currentStatus: 'WAITING_FOR_REQUESTER' } },
    ];
    for (const c of calls) {
      const res = await send(c.method, c.url, c.body, cookie);
      expect(res.status, `${c.method.toUpperCase()} ${c.url}`).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    }
    expect(await snapshot()).toBe(before);
  });

  it('SEC-02: a Requester reads Actions Taken of their own Ticket (no internalNotes) and gets 404 for another Requester\'s Ticket', async () => {
    const own = await request(app).get(`/api/tickets/${ticketNumber}`).set('Cookie', await loginAs(fx.requesterA.email));
    expect(own.status).toBe(200);
    expect(own.body.actionsTaken).toHaveLength(1);
    expect(own.body.actionsTaken[0]).toMatchObject({ id: action.id, result: 'Initial result' });
    expect(own.body).not.toHaveProperty('internalNotes');
    expect(JSON.stringify(own.body)).not.toContain('Private staff note');

    const other = await request(app).get(`/api/tickets/${ticketNumber}`).set('Cookie', await loginAs(fx.requesterB.email));
    expect(other.status).toBe(404);
    expect(other.body.error).toBe('NOT_FOUND');
    expect(other.body).not.toHaveProperty('actionsTaken');
  });

  it('SEC-03: every new endpoint without a session returns 401 NOT_AUTHENTICATED', async () => {
    for (const c of actionEndpoints()) {
      const res = await send(c.method, c.url, c.body);
      expect(res.status, `${c.method.toUpperCase()} ${c.url}`).toBe(401);
      expect(res.body.error).toBe('NOT_AUTHENTICATED');
    }
  });

  it('SEC-04: a user who must change their password gets 403 PASSWORD_CHANGE_REQUIRED on every new endpoint', async () => {
    const cookie = await loginAs(fx.mustChangeStaff.email);
    for (const c of actionEndpoints()) {
      const res = await send(c.method, c.url, c.body, cookie);
      expect(res.status, `${c.method.toUpperCase()} ${c.url}`).toBe(403);
      expect(res.body.error).toBe('PASSWORD_CHANGE_REQUIRED');
    }
  });

  it('SEC-05: malformed ids and payloads give 404/400, never 500, and no stack trace', async () => {
    const responses = [];

    for (const badId of ['abc', '1.5', '-1', '99999999']) {
      const edit = await request(app).patch(`${base()}/${badId}`).set('Cookie', staffCookie)
        .send({ expectedUpdatedAt: action.updatedAt, description: 'x' });
      const status = await request(app).patch(`${base()}/${badId}/status`).set('Cookie', staffCookie)
        .send({ status: 'CANCELLED', expectedUpdatedAt: action.updatedAt });
      expect(edit.status, badId).toBe(404);
      expect(status.status, badId).toBe(404);
      responses.push(edit, status);
    }

    // An action that exists but belongs to another Ticket is not found under this Ticket.
    const otherTicket = await createTicket(prisma, fx);
    const foreign = await request(app).patch(`/api/staff/tickets/${otherTicket.ticketNumber}/actions/${action.id}`)
      .set('Cookie', staffCookie).send({ expectedUpdatedAt: action.updatedAt, description: 'x' });
    expect(foreign.status).toBe(404);

    const unknownTicket = await request(app).get('/api/staff/tickets/TKT-NOPE-000000/actions').set('Cookie', staffCookie);
    expect(unknownTicket.status).toBe(404);

    const wrongTypes = [
      actionBody({ description: 123 }),
      actionBody({ followUpRequired: 'yes' }),
      actionBody({ performedById: 'twelve' }),
      actionBody({ actionAt: { not: 'a date' } }),
      actionBody({ result: ['array'] }),
    ];
    for (const body of wrongTypes) {
      const res = await request(app).post(base()).set('Cookie', staffCookie).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      responses.push(res);
    }

    const badToken = await request(app).patch(`${base()}/${action.id}`).set('Cookie', staffCookie)
      .send({ expectedUpdatedAt: 'yesterday', description: 'x' });
    expect(badToken.status).toBe(400);
    responses.push(badToken);

    const malformedJson = await request(app).post(base()).set('Cookie', staffCookie)
      .set('Content-Type', 'application/json').send('{"description": ');
    expect(malformedJson.status).toBe(400);
    expect(malformedJson.body.error).toBe('VALIDATION_ERROR');
    responses.push(malformedJson);

    for (const res of [...responses, foreign, unknownTicket]) {
      expect(res.status).not.toBe(500);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/at \S+ \(|node_modules|prisma\.|SELECT |Invalid `/);
      expect(Object.keys(res.body)).toEqual(expect.arrayContaining(['error', 'message']));
    }
    expect(await prisma.actionTaken.count({ where: { ticketId } })).toBe(1);
  });
  it('SEC-05: an unknown status filter value (single or in a list) is 400 VALIDATION_ERROR with fields.status, never 500', async () => {
    const requesterCookie = await loginAs(fx.requesterA.email);
    for (const [path, cookie] of [['/api/tickets', requesterCookie], ['/api/staff/tickets', staffCookie]] as const) {
      for (const status of ['FOO', 'OPEN,FOO']) {
        const res = await request(app).get(path).query({ status }).set('Cookie', cookie);
        expect(res.status, `${path} ${status}`).toBe(400);
        expect(res.body.error).toBe('VALIDATION_ERROR');
        expect(res.body.fields.status).toEqual(expect.any(String));
      }
    }
  });
});
