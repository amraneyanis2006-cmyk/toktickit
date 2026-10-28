import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { TicketStatus } from '@prisma/client';
import app from '../../src/app';
import { isValidTransition } from '../../src/utils/statusTransition';
import { createFixture, cleanupPrefix, createTicket, loginAs } from './fixtures';
import type { Lab4Fixture } from './fixtures';

const prisma = new PrismaClient();
const PREFIX = 'l4wf';
const STATUSES: TicketStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'];

let fx: Lab4Fixture;
let staffCookie: string;
let staffBCookie: string;

const statusUrl = (ticketNumber: string) => `/api/staff/tickets/${ticketNumber}/status`;

function changeStatus(ticketNumber: string, body: Record<string, unknown>, cookie = staffCookie) {
  return request(app).patch(statusUrl(ticketNumber)).set('Cookie', cookie).send(body);
}

/** Inserts an action directly, in a chosen status (the Actions Taken API is covered elsewhere). */
function addAction(ticketId: number, status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED', minutesAgo = 60) {
  return prisma.actionTaken.create({
    data: {
      ticketId,
      actionAt: new Date(Date.now() - minutesAgo * 60_000),
      description: `Fixture ${status.toLowerCase()} action`,
      result: status === 'COMPLETED' ? 'Fixture result' : null,
      status,
      performedById: fx.staffA.id,
      createdById: fx.staffA.id,
      completedAt: status === 'COMPLETED' ? new Date() : null,
      cancelledAt: status === 'CANCELLED' ? new Date() : null,
    },
  });
}

async function resolvable(opts: { status?: TicketStatus } = {}) {
  const ticket = await createTicket(prisma, fx, { status: opts.status ?? 'IN_PROGRESS' });
  await addAction(ticket.id, 'COMPLETED');
  return ticket;
}

const historyCount = (ticketId: number) => prisma.ticketStatusChange.count({ where: { ticketId } });

beforeAll(async () => {
  fx = await createFixture(prisma, PREFIX);
  staffCookie = await loginAs(fx.staffA.email);
  staffBCookie = await loginAs(fx.staffB.email);
});

afterAll(async () => {
  await cleanupPrefix(prisma, PREFIX);
  await prisma.$disconnect();
});

describe('Resolution gate on PATCH /api/staff/tickets/:ticketNumber/status', () => {
  it('WF-01: resolving with no completed action is 409 RESOLUTION_BLOCKED [NO_COMPLETED_ACTION]; status unchanged', async () => {
    const none = await createTicket(prisma, fx);
    const onlyCancelled = await createTicket(prisma, fx);
    await addAction(onlyCancelled.id, 'CANCELLED');

    for (const ticket of [none, onlyCancelled]) {
      const res = await changeStatus(ticket.ticketNumber, { currentStatus: 'RESOLVED' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('RESOLUTION_BLOCKED');
      expect(res.body.blockers).toEqual(['NO_COMPLETED_ACTION']);
      expect(res.body.message).toEqual(expect.any(String));
      const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(row.currentStatus).toBe('IN_PROGRESS');
      expect(row.resolvedAt).toBeNull();
      expect(await historyCount(ticket.id)).toBe(0);
    }
  });

  it('WF-02: resolving with an open action (direct API call) is 409 RESOLUTION_BLOCKED [OPEN_ACTIONS]; status unchanged', async () => {
    for (const open of ['PLANNED', 'IN_PROGRESS'] as const) {
      const ticket = await resolvable();
      await addAction(ticket.id, open);
      const res = await changeStatus(ticket.ticketNumber, { currentStatus: 'RESOLVED' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('RESOLUTION_BLOCKED');
      expect(res.body.blockers).toEqual(['OPEN_ACTIONS']);
      const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(row.currentStatus).toBe('IN_PROGRESS');
      expect(await historyCount(ticket.id)).toBe(0);
    }

    const both = await createTicket(prisma, fx);
    await addAction(both.id, 'PLANNED');
    const res = await changeStatus(both.ticketNumber, { currentStatus: 'RESOLVED' });
    expect(res.body.blockers).toEqual(['NO_COMPLETED_ACTION', 'OPEN_ACTIONS']);

    // An unowned ticket still fails first with the Lab 3 code.
    const unowned = await createTicket(prisma, fx, { ownerId: null });
    const noOwner = await changeStatus(unowned.ticketNumber, { currentStatus: 'RESOLVED' });
    expect(noOwner.status).toBe(409);
    expect(noOwner.body.error).toBe('UNASSIGNED_TICKET');
  });

  it('WF-03: resolving when the gate is met sets RESOLVED, resolvedAt, exactly one history row, and the api-spec sec 8 shape', async () => {
    const ticket = await resolvable();
    await addAction(ticket.id, 'CANCELLED');
    const before = Date.now();
    const res = await changeStatus(ticket.ticketNumber, { currentStatus: 'RESOLVED', expectedUpdatedAt: ticket.updatedAt.toISOString() });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ['currentStatus', 'legalNextStatuses', 'requesterIndicatedResolved', 'resolvedAt', 'statusChange', 'ticketNumber', 'updatedAt'].sort()
    );
    expect(res.body).toMatchObject({
      ticketNumber: ticket.ticketNumber,
      currentStatus: 'RESOLVED',
      requesterIndicatedResolved: false,
      legalNextStatuses: ['CLOSED', 'REOPENED'],
      statusChange: {
        fromStatus: 'IN_PROGRESS',
        toStatus: 'RESOLVED',
        changedBy: { id: fx.staffA.id, name: fx.staffA.name },
      },
    });
    expect(new Date(res.body.resolvedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(typeof res.body.statusChange.id).toBe('number');

    const rows = await prisma.ticketStatusChange.findMany({ where: { ticketId: ticket.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fromStatus: 'IN_PROGRESS', toStatus: 'RESOLVED', changedById: fx.staffA.id });
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.currentStatus).toBe('RESOLVED');
    expect(row.resolvedAt!.toISOString()).toBe(res.body.resolvedAt);
    expect(row.updatedAt.toISOString()).toBe(res.body.updatedAt);
  });
});

describe('Transition matrix (BR-11)', () => {
  it('WF-04: every pair not in the matrix (all 8x8 checked) is 409 INVALID_TRANSITION and the status is unchanged', async () => {
    const ticket = await resolvable();
    let checked = 0;
    for (const from of STATUSES) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { currentStatus: from } });
      for (const to of STATUSES) {
        if (isValidTransition(from, to)) continue;
        const res = await changeStatus(ticket.ticketNumber, { currentStatus: to });
        expect(res.status, `${from} -> ${to}`).toBe(409);
        expect(res.body.error, `${from} -> ${to}`).toBe('INVALID_TRANSITION');
        const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
        expect(row.currentStatus, `${from} -> ${to}`).toBe(from);
        checked++;
      }
    }
    // 64 pairs minus the 17 legal edges of spec sec 5.1.
    expect(checked).toBe(47);
    expect(await historyCount(ticket.id)).toBe(0);
  });
});

describe('Stale and concurrent status changes (BR-17)', () => {
  it('WF-05: a stale expectedUpdatedAt is 409 STALE_UPDATE with the current ticket; nothing is overwritten', async () => {
    const ticket = await resolvable();
    const staleToken = ticket.updatedAt.toISOString();
    const first = await changeStatus(ticket.ticketNumber, { currentStatus: 'WAITING_FOR_REQUESTER', expectedUpdatedAt: staleToken }, staffBCookie);
    expect(first.status).toBe(200);

    const stale = await changeStatus(ticket.ticketNumber, { currentStatus: 'RESOLVED', expectedUpdatedAt: staleToken });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('STALE_UPDATE');
    expect(stale.body.current).toMatchObject({ ticketNumber: ticket.ticketNumber, currentStatus: 'WAITING_FOR_REQUESTER', updatedAt: first.body.updatedAt });
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.currentStatus).toBe('WAITING_FOR_REQUESTER');
    expect(await historyCount(ticket.id)).toBe(1);

    const invalidToken = await changeStatus(ticket.ticketNumber, { currentStatus: 'IN_PROGRESS', expectedUpdatedAt: 'yesterday' });
    expect(invalidToken.status).toBe(400);
    expect(invalidToken.body.error).toBe('VALIDATION_ERROR');
  });

  it('WF-05: two parallel transitions - exactly one succeeds and exactly one history row is written', async () => {
    for (const withToken of [false, true]) {
      const ticket = await resolvable();
      const body = { currentStatus: 'WAITING_FOR_REQUESTER', ...(withToken ? { expectedUpdatedAt: ticket.updatedAt.toISOString() } : {}) };
      const results = await Promise.all([changeStatus(ticket.ticketNumber, body), changeStatus(ticket.ticketNumber, body, staffBCookie)]);
      expect(results.map((r) => r.status).sort(), `token=${withToken}`).toEqual([200, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect(['STALE_UPDATE', 'INVALID_TRANSITION']).toContain(loser.body.error);
      expect(await historyCount(ticket.id), `token=${withToken}`).toBe(1);
    }
  });
});

describe('Close / reopen / cancel (BR-13, BR-14, BR-15, BR-16)', () => {
  it('WF-06: CLOSED keeps resolvedAt; REOPENED clears resolvedAt and requesterIndicatedResolved; one history row per change', async () => {
    const ticket = await resolvable();
    await prisma.ticket.update({ where: { id: ticket.id }, data: { requesterIndicatedResolved: true } });

    const resolved = await changeStatus(ticket.ticketNumber, { currentStatus: 'RESOLVED' });
    expect(resolved.status).toBe(200);
    const closed = await changeStatus(ticket.ticketNumber, { currentStatus: 'CLOSED', expectedUpdatedAt: resolved.body.updatedAt });
    expect(closed.status).toBe(200);
    expect(closed.body.resolvedAt).toBe(resolved.body.resolvedAt);
    expect(closed.body.legalNextStatuses).toEqual(['REOPENED']);

    const reopened = await changeStatus(ticket.ticketNumber, { currentStatus: 'REOPENED', expectedUpdatedAt: closed.body.updatedAt });
    expect(reopened.status).toBe(200);
    expect(reopened.body.resolvedAt).toBeNull();
    expect(reopened.body.requesterIndicatedResolved).toBe(false);

    const history = await prisma.ticketStatusChange.findMany({ where: { ticketId: ticket.id }, orderBy: [{ changedAt: 'asc' }, { id: 'asc' }] });
    expect(history.map((h) => `${h.fromStatus}->${h.toStatus}`)).toEqual([
      'IN_PROGRESS->RESOLVED',
      'RESOLVED->CLOSED',
      'CLOSED->REOPENED',
    ]);
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.resolvedAt).toBeNull();
    expect(row.requesterIndicatedResolved).toBe(false);
  });

  it('WF-07: the Requester "Problem Appears Resolved" never changes the status; staff detail shows requesterIndicatedResolved', async () => {
    const ticket = await resolvable({ status: 'WAITING_FOR_REQUESTER' });
    const requesterCookie = await loginAs(fx.requesterA.email);
    const marked = await request(app).patch(`/api/tickets/${ticket.ticketNumber}/resolved-indication`).set('Cookie', requesterCookie);
    expect(marked.status).toBe(200);

    const staff = await request(app).get(`/api/staff/tickets/${ticket.ticketNumber}`).set('Cookie', staffCookie);
    expect(staff.body.currentStatus).toBe('WAITING_FOR_REQUESTER');
    expect(staff.body.requesterIndicatedResolved).toBe(true);
    expect(staff.body.resolvedAt).toBeNull();
    expect(staff.body.statusHistory).toEqual([]);

    const requesterChange = await changeStatus(ticket.ticketNumber, { currentStatus: 'RESOLVED' }, requesterCookie);
    expect(requesterChange.status).toBe(403);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).currentStatus).toBe('WAITING_FOR_REQUESTER');
  });

  it('WF-08: role-appropriate visibility and stable ordering of actions and status history', async () => {
    const ticket = await createTicket(prisma, fx, { requesterId: fx.requesterA.id });
    const late = await addAction(ticket.id, 'COMPLETED', 30);
    const early = await addAction(ticket.id, 'CANCELLED', 90);
    await prisma.ticketInternalNote.create({ data: { ticketId: ticket.id, authorId: fx.staffA.id, content: 'Staff-only note' } });
    await changeStatus(ticket.ticketNumber, { currentStatus: 'WAITING_FOR_REQUESTER' });
    await changeStatus(ticket.ticketNumber, { currentStatus: 'IN_PROGRESS' });

    const requesterCookie = await loginAs(fx.requesterA.email);
    const own = await request(app).get(`/api/tickets/${ticket.ticketNumber}`).set('Cookie', requesterCookie);
    expect(own.status).toBe(200);
    expect(own.body).not.toHaveProperty('internalNotes');
    expect(own.body).not.toHaveProperty('resolutionGate');
    expect(own.body.actionsTaken.map((a: { id: number }) => a.id)).toEqual([early.id, late.id]);
    expect(own.body.statusHistory.map((h: { fromStatus: string; toStatus: string }) => `${h.fromStatus}->${h.toStatus}`)).toEqual([
      'IN_PROGRESS->WAITING_FOR_REQUESTER',
      'WAITING_FOR_REQUESTER->IN_PROGRESS',
    ]);
    expect(own.body.statusHistory[0]).toMatchObject({ changedBy: { id: fx.staffA.id, name: fx.staffA.name } });
    expect(Object.keys(own.body.statusHistory[0]).sort()).toEqual(['changedAt', 'changedBy', 'fromStatus', 'id', 'toStatus']);

    const staff = await request(app).get(`/api/staff/tickets/${ticket.ticketNumber}`).set('Cookie', staffCookie);
    expect(staff.body.internalNotes).toHaveLength(1);
    expect(staff.body.actionsTaken).toEqual(own.body.actionsTaken);
    expect(staff.body.statusHistory).toEqual(own.body.statusHistory);
    expect(staff.body.resolutionGate).toEqual({ canResolve: true, blockers: [] });
    expect(staff.body.legalNextStatuses).toEqual(['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED']);
    expect(staff.body).toHaveProperty('resolvedAt', null);

    // The gate in the detail is the same function the status endpoint uses.
    await addAction(ticket.id, 'PLANNED', 10);
    const blocked = await request(app).get(`/api/staff/tickets/${ticket.ticketNumber}`).set('Cookie', staffCookie);
    expect(blocked.body.resolutionGate).toEqual({ canResolve: false, blockers: ['OPEN_ACTIONS'] });
    const attempt = await changeStatus(ticket.ticketNumber, { currentStatus: 'RESOLVED' });
    expect(attempt.body.blockers).toEqual(blocked.body.resolutionGate.blockers);

    const again = await request(app).get(`/api/tickets/${ticket.ticketNumber}`).set('Cookie', requesterCookie);
    expect(again.body.statusHistory).toEqual(own.body.statusHistory);
  });

  it('WF-09: a Ticket without actions can be CANCELLED, and CANCELLED is terminal', async () => {
    const ticket = await createTicket(prisma, fx, { status: 'NEW', ownerId: null });
    const cancelled = await changeStatus(ticket.ticketNumber, { currentStatus: 'CANCELLED' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.currentStatus).toBe('CANCELLED');
    expect(cancelled.body.legalNextStatuses).toEqual([]);
    expect(await historyCount(ticket.id)).toBe(1);

    for (const to of STATUSES) {
      const res = await changeStatus(ticket.ticketNumber, { currentStatus: to });
      expect(res.status, `CANCELLED -> ${to}`).toBe(409);
      expect(res.body.error).toBe('INVALID_TRANSITION');
    }
    expect(await historyCount(ticket.id)).toBe(1);
  });
});
