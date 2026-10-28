import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { Prisma, TicketStatus } from '@prisma/client';
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
let adminCookie: string;

// The 17 legal edges of specification.md sec 5.1, written out independently of
// the production matrix so a wrong edge in the code cannot hide (AC-10).
const LEGAL_EDGES = new Set([
  'NEW>OPEN', 'NEW>IN_PROGRESS', 'NEW>CANCELLED',
  'OPEN>IN_PROGRESS', 'OPEN>CANCELLED',
  'IN_PROGRESS>WAITING_FOR_REQUESTER', 'IN_PROGRESS>RESOLVED', 'IN_PROGRESS>CANCELLED',
  'WAITING_FOR_REQUESTER>IN_PROGRESS', 'WAITING_FOR_REQUESTER>RESOLVED', 'WAITING_FOR_REQUESTER>CANCELLED',
  'RESOLVED>CLOSED', 'RESOLVED>REOPENED',
  'CLOSED>REOPENED',
  'REOPENED>IN_PROGRESS', 'REOPENED>WAITING_FOR_REQUESTER', 'REOPENED>CANCELLED',
]);

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
  adminCookie = await loginAs(fx.admin.email);
});

/**
 * Forces an interleaving deterministically: a separate transaction locks the
 * ticket row and makes `change`, then fires the request and waits before
 * committing. The request reads the old committed row, then has to wait for
 * the lock - exactly the "changed between read and write" window.
 */
async function raceAgainst<T>(
  ticketId: number,
  mode: 'UPDATE' | 'SHARE',
  change: (tx: Prisma.TransactionClient) => Promise<unknown>,
  fire: () => PromiseLike<T>
): Promise<T> {
  let pending!: Promise<T>;
  await prisma.$transaction(
    async (tx) => {
      if (mode === 'UPDATE') await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR SHARE`;
      await change(tx);
      pending = Promise.resolve(fire());
      await waitForBlockedRequest();
    },
    { timeout: 15000 }
  );
  return pending;
}

/** Proves the interleaving: waits until another backend is waiting for a row lock (fails after 8 s). */
async function waitForBlockedRequest() {
  const deadline = Date.now() + 8000;
  for (;;) {
    const rows = await prisma.$queryRaw<Array<{ waiting: number }>>`
      SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted`;
    if ((rows[0]?.waiting ?? 0) > 0) return;
    if (Date.now() > deadline) throw new Error('The request never waited on the ticket row lock - interleaving not forced.');
    await new Promise((r) => setTimeout(r, 25));
  }
}

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
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('RESOLUTION_BLOCKED');
    expect(res.body.blockers).toEqual(['NO_COMPLETED_ACTION', 'OPEN_ACTIONS']);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: both.id } })).currentStatus).toBe('IN_PROGRESS');
    expect(await historyCount(both.id)).toBe(0);

    // An unowned ticket still fails first with the Lab 3 code.
    const unowned = await createTicket(prisma, fx, { ownerId: null });
    const noOwner = await changeStatus(unowned.ticketNumber, { currentStatus: 'RESOLVED' });
    expect(noOwner.status).toBe(409);
    expect(noOwner.body.error).toBe('UNASSIGNED_TICKET');
  });

  it('WF-02: an action created while a resolve is in flight is seen by the gate (no RESOLVED ticket with an open action)', async () => {
    const ticket = await resolvable();
    // Another request is creating a PLANNED action and holds the ticket row (FOR SHARE, as POST .../actions does).
    const res = await raceAgainst(
      ticket.id,
      'SHARE',
      (tx) =>
        tx.actionTaken.create({
          data: {
            ticketId: ticket.id, actionAt: new Date(), description: 'Concurrent open action', status: 'PLANNED',
            performedById: fx.staffA.id, createdById: fx.staffA.id,
          },
        }),
      () => changeStatus(ticket.ticketNumber, { currentStatus: 'RESOLVED' })
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('RESOLUTION_BLOCKED');
    expect(res.body.blockers).toEqual(['OPEN_ACTIONS']);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).currentStatus).toBe('IN_PROGRESS');
  });

  it('WF-02: an action create racing a resolve that commits first is refused with TICKET_NOT_ACTIVE', async () => {
    const ticket = await resolvable();
    const res = await raceAgainst(
      ticket.id,
      'UPDATE',
      (tx) => tx.ticket.update({ where: { id: ticket.id }, data: { currentStatus: 'RESOLVED', resolvedAt: new Date() } }),
      () =>
        request(app)
          .post(`/api/staff/tickets/${ticket.ticketNumber}/actions`)
          .set('Cookie', staffCookie)
          .send({ actionAt: new Date().toISOString(), description: 'Late open action', followUpRequired: false })
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('TICKET_NOT_ACTIVE');
    const open = await prisma.actionTaken.count({ where: { ticketId: ticket.id, status: { in: ['PLANNED', 'IN_PROGRESS'] } } });
    expect(open).toBe(0);
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
    expect(res.body.resolvedAt).toBe(res.body.statusChange.changedAt);
    expect(typeof res.body.statusChange.id).toBe('number');

    const rows = await prisma.ticketStatusChange.findMany({ where: { ticketId: ticket.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fromStatus: 'IN_PROGRESS', toStatus: 'RESOLVED', changedById: fx.staffA.id });
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.currentStatus).toBe('RESOLVED');
    expect(row.resolvedAt!.toISOString()).toBe(res.body.resolvedAt);
    expect(row.updatedAt.toISOString()).toBe(res.body.updatedAt);
  });

  it('WF-03: an Administrator can resolve, and WAITING_FOR_REQUESTER -> RESOLVED is gated the same way', async () => {
    const waiting = await resolvable({ status: 'WAITING_FOR_REQUESTER' });
    const res = await changeStatus(waiting.ticketNumber, { currentStatus: 'RESOLVED' }, adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.statusChange).toMatchObject({ fromStatus: 'WAITING_FOR_REQUESTER', toStatus: 'RESOLVED', changedBy: { id: fx.admin.id } });

    const blocked = await createTicket(prisma, fx, { status: 'WAITING_FOR_REQUESTER' });
    const refused = await changeStatus(blocked.ticketNumber, { currentStatus: 'RESOLVED' }, adminCookie);
    expect(refused.status).toBe(409);
    expect(refused.body.blockers).toEqual(['NO_COMPLETED_ACTION']);
  });
});

describe('Transition matrix (BR-11)', () => {
  it('WF-04: every pair not in the matrix (all 8x8 checked) is 409 INVALID_TRANSITION and the status is unchanged', async () => {
    const ticket = await resolvable();
    let checked = 0;
    for (const from of STATUSES) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { currentStatus: from } });
      for (const to of STATUSES) {
        if (LEGAL_EDGES.has(`${from}>${to}`)) {
          expect(isValidTransition(from, to), `legal ${from} -> ${to}`).toBe(true);
          continue;
        }
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
    expect(Object.keys(stale.body.current).sort()).toEqual(
      ['currentStatus', 'legalNextStatuses', 'requesterIndicatedResolved', 'resolvedAt', 'ticketNumber', 'updatedAt'].sort()
    );

    // The stale check runs before the matrix (api-spec sec 8 order).
    const staleIllegal = await changeStatus(ticket.ticketNumber, { currentStatus: 'OPEN', expectedUpdatedAt: staleToken });
    expect(staleIllegal.status).toBe(409);
    expect(staleIllegal.body.error).toBe('STALE_UPDATE');
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.currentStatus).toBe('WAITING_FOR_REQUESTER');
    expect(await historyCount(ticket.id)).toBe(1);

    const invalidToken = await changeStatus(ticket.ticketNumber, { currentStatus: 'IN_PROGRESS', expectedUpdatedAt: 'yesterday' });
    expect(invalidToken.status).toBe(400);
    expect(invalidToken.body.error).toBe('VALIDATION_ERROR');
    expect(invalidToken.body.fields.expectedUpdatedAt).toBeDefined();

    for (const body of [{}, { currentStatus: 'FOO' }, { currentStatus: 42 }]) {
      const bad = await changeStatus(ticket.ticketNumber, body);
      expect(bad.status, JSON.stringify(body)).toBe(400);
      expect(bad.body.fields.currentStatus, JSON.stringify(body)).toBeDefined();
    }
    // null means "not sent" (Lab 3 clients never send the token).
    const nullToken = await changeStatus(ticket.ticketNumber, { currentStatus: 'IN_PROGRESS', expectedUpdatedAt: null });
    expect(nullToken.status).toBe(200);
    const back = await changeStatus(ticket.ticketNumber, { currentStatus: 'WAITING_FOR_REQUESTER' });
    expect(back.status).toBe(200);
    const bothBad = await changeStatus(ticket.ticketNumber, { currentStatus: 'FOO', expectedUpdatedAt: 'yesterday' });
    expect(Object.keys(bothBad.body.fields).sort()).toEqual(['currentStatus', 'expectedUpdatedAt']);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).currentStatus).toBe('WAITING_FOR_REQUESTER');
  });

  it('WF-05: a status changed between the read and the write is 409 STALE_UPDATE (conditional update, 0 rows)', async () => {
    const ticket = await resolvable();
    const res = await raceAgainst(
      ticket.id,
      'UPDATE',
      (tx) => tx.ticket.update({ where: { id: ticket.id }, data: { currentStatus: 'WAITING_FOR_REQUESTER' } }),
      () => changeStatus(ticket.ticketNumber, { currentStatus: 'CANCELLED' })
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('STALE_UPDATE');
    expect(res.body.current.currentStatus).toBe('WAITING_FOR_REQUESTER');
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).currentStatus).toBe('WAITING_FOR_REQUESTER');
    expect(await historyCount(ticket.id)).toBe(0);
  });

  it('WF-05: with expectedUpdatedAt, any update landing between the check and the write is 409 STALE_UPDATE', async () => {
    const ticket = await resolvable();
    const res = await raceAgainst(
      ticket.id,
      'UPDATE',
      (tx) => tx.ticket.update({ where: { id: ticket.id }, data: { itPriority: 'HIGH' } }),
      () => changeStatus(ticket.ticketNumber, { currentStatus: 'WAITING_FOR_REQUESTER', expectedUpdatedAt: ticket.updatedAt.toISOString() })
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('STALE_UPDATE');
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).currentStatus).toBe('IN_PROGRESS');
    expect(await historyCount(ticket.id)).toBe(0);
  });

  it('WF-05: two parallel transitions - exactly one succeeds and exactly one history row is written', async () => {
    for (const withToken of [false, true]) {
      const ticket = await resolvable();
      const body = { currentStatus: 'WAITING_FOR_REQUESTER', ...(withToken ? { expectedUpdatedAt: ticket.updatedAt.toISOString() } : {}) };
      const results = await Promise.all([changeStatus(ticket.ticketNumber, body), changeStatus(ticket.ticketNumber, body, staffBCookie)]);
      expect(results.map((r) => r.status).sort(), `token=${withToken}`).toEqual([200, 409]);
      const loser = results.find((r) => r.status === 409)!;
      if (withToken) {
        expect(loser.body.error).toBe('STALE_UPDATE');
        expect(loser.body.current).toBeDefined();
      } else {
        expect(['STALE_UPDATE', 'INVALID_TRANSITION']).toContain(loser.body.error);
      }
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

    // Resolving again after a reopen sets a fresh resolvedAt.
    expect((await changeStatus(ticket.ticketNumber, { currentStatus: 'IN_PROGRESS' })).status).toBe(200);
    const again = await changeStatus(ticket.ticketNumber, { currentStatus: 'RESOLVED' });
    expect(again.status).toBe(200);
    expect(new Date(again.body.resolvedAt).getTime()).toBeGreaterThan(new Date(resolved.body.resolvedAt).getTime());
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
    expect(own.body).toHaveProperty('resolvedAt', null);
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

    // Unowned tickets report UNASSIGNED in the detail gate.
    const unowned = await createTicket(prisma, fx, { ownerId: null });
    const unownedDetail = await request(app).get(`/api/staff/tickets/${unowned.ticketNumber}`).set('Cookie', staffCookie);
    expect(unownedDetail.body.resolutionGate).toEqual({ canResolve: false, blockers: ['UNASSIGNED', 'NO_COMPLETED_ACTION'] });

    // History is ordered by changedAt, then id - not by insertion order.
    const ordered = await createTicket(prisma, fx, { status: 'RESOLVED', resolvedAt: new Date() });
    const later = await prisma.ticketStatusChange.create({
      data: { ticketId: ordered.id, fromStatus: 'IN_PROGRESS', toStatus: 'RESOLVED', changedById: fx.staffA.id, changedAt: new Date(Date.now() - 60_000) },
    });
    const earlier = await prisma.ticketStatusChange.create({
      data: { ticketId: ordered.id, fromStatus: 'NEW', toStatus: 'IN_PROGRESS', changedById: fx.staffA.id, changedAt: new Date(Date.now() - 120_000) },
    });
    const orderedDetail = await request(app).get(`/api/staff/tickets/${ordered.ticketNumber}`).set('Cookie', staffCookie);
    expect(orderedDetail.body.statusHistory.map((h: { id: number }) => h.id)).toEqual([earlier.id, later.id]);
    expect(orderedDetail.body.legalNextStatuses).toEqual(['CLOSED', 'REOPENED']);
  });

  it('WF-09: an action edit or status change racing a ticket cancel is refused with TICKET_NOT_ACTIVE', async () => {
    for (const route of ['edit', 'status'] as const) {
      const ticket = await createTicket(prisma, fx);
      const action = await addAction(ticket.id, 'PLANNED');
      const url = `/api/staff/tickets/${ticket.ticketNumber}/actions/${action.id}${route === 'status' ? '/status' : ''}`;
      const body = route === 'status'
        ? { status: 'IN_PROGRESS', expectedUpdatedAt: action.updatedAt.toISOString() }
        : { description: 'Edited during a cancel', expectedUpdatedAt: action.updatedAt.toISOString() };
      const res = await raceAgainst(
        ticket.id,
        'UPDATE',
        (tx) => tx.ticket.update({ where: { id: ticket.id }, data: { currentStatus: 'CANCELLED' } }),
        () => request(app).patch(url).set('Cookie', staffCookie).send(body)
      );
      expect(res.status, route).toBe(409);
      expect(res.body.error, route).toBe('TICKET_NOT_ACTIVE');
      const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } });
      expect(row.updatedAt.toISOString(), route).toBe(action.updatedAt.toISOString());
    }
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
