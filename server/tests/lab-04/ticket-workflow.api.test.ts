import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
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
  await dropFaultInjection();
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
  let pending: Promise<T> | undefined;
  try {
    await prisma.$transaction(
      async (tx) => {
        // 'UPDATE' stands in for the status endpoint, so it takes the same lock mode.
        if (mode === 'UPDATE') await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR NO KEY UPDATE`;
        else await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR SHARE`;
        const pidRows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        const pid = pidRows[0]!.pid;
        await change(tx);
        pending = Promise.resolve(fire());
        await waitForBlockedBy(pid);
      },
      { timeout: 15000 }
    );
  } catch (error) {
    // Never leave a fired request running after a failed race.
    await pending?.catch(() => {});
    throw error;
  }
  return pending!;
}

/**
 * Proves the interleaving: waits until some backend is blocked by THIS
 * transaction (pg_blocking_pids), i.e. the request under test is waiting on the
 * ticket row lock held above. Fails after 8 s.
 */
async function waitForBlockedBy(holderPid: number) {
  const deadline = Date.now() + 8000;
  for (;;) {
    const rows = await prisma.$queryRaw<Array<{ blocked: number }>>`
      SELECT count(*)::int AS blocked FROM pg_stat_activity WHERE ${holderPid}::int = ANY(pg_blocking_pids(pid))`;
    if ((rows[0]?.blocked ?? 0) > 0) return;
    if (Date.now() > deadline) throw new Error('The request never waited on the ticket row lock - interleaving not forced.');
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Removes fault-injection triggers/functions an interrupted run may have left behind. */
async function dropFaultInjection() {
  const fns = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT proname AS name FROM pg_proc WHERE proname LIKE 'l4wf_fail_history_%'`;
  for (const { name } of fns) {
    if (!/^l4wf_fail_history_\d+$/.test(name)) continue;
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "TicketStatusChange"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${name}()`);
  }
}

afterAll(async () => {
  await dropFaultInjection();
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
      expect(res.body.message).toBe('This ticket cannot be resolved yet: complete or cancel the open actions.');
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
    expect(res.body.message).toBe('This ticket cannot be resolved yet: complete at least one action and complete or cancel the open actions.');
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

  it('WF-02: an owner removed while a resolve waits on the lock is 409 UNASSIGNED_TICKET (checked on the locked row)', async () => {
    const ticket = await resolvable();
    const res = await raceAgainst(
      ticket.id,
      'UPDATE',
      (tx) => tx.ticket.update({ where: { id: ticket.id }, data: { ticketOwnerId: null } }),
      () => changeStatus(ticket.ticketNumber, { currentStatus: 'RESOLVED' })
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('UNASSIGNED_TICKET');
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).currentStatus).toBe('IN_PROGRESS');
    expect(await historyCount(ticket.id)).toBe(0);
  });

  it('WF-06: an owner removed while a close waits on the lock is 409 UNASSIGNED_TICKET; a legacy RESOLVED ticket without actions can be CLOSED', async () => {
    const ticket = await createTicket(prisma, fx, { status: 'RESOLVED', resolvedAt: new Date() });
    const res = await raceAgainst(
      ticket.id,
      'UPDATE',
      (tx) => tx.ticket.update({ where: { id: ticket.id }, data: { ticketOwnerId: null } }),
      () => changeStatus(ticket.ticketNumber, { currentStatus: 'CLOSED' })
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('UNASSIGNED_TICKET');
    const unchanged = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(unchanged.currentStatus).toBe('RESOLVED');
    expect(unchanged.resolvedAt!.toISOString()).toBe(ticket.resolvedAt!.toISOString());
    expect(await historyCount(ticket.id)).toBe(0);

    // spec sec 7.1.3: the gate applies only to new transitions into RESOLVED.
    const legacy = await createTicket(prisma, fx, { status: 'RESOLVED', resolvedAt: new Date('2026-09-01T00:00:00.000Z') });
    const closed = await changeStatus(legacy.ticketNumber, { currentStatus: 'CLOSED' });
    expect(closed.status).toBe(200);
    expect(closed.body.resolvedAt).toBe('2026-09-01T00:00:00.000Z');
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
    // The matrix is checked before the owner: an unowned illegal pair is INVALID_TRANSITION.
    const unowned = await createTicket(prisma, fx, { status: 'NEW', ownerId: null });
    const illegal = await changeStatus(unowned.ticketNumber, { currentStatus: 'RESOLVED' });
    expect(illegal.status).toBe(409);
    expect(illegal.body.error).toBe('INVALID_TRANSITION');
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
    for (const token of [123, {}, true, '2026-10-28T03:40:12']) {
      const bad = await changeStatus(ticket.ticketNumber, { currentStatus: 'IN_PROGRESS', expectedUpdatedAt: token });
      expect(bad.status, JSON.stringify(token)).toBe(400);
      expect(bad.body.fields.expectedUpdatedAt, JSON.stringify(token)).toBeDefined();
    }

    // Validation comes before the lookup (api-spec sec 8 order): 400, not 404.
    const unknown = await request(app).patch(statusUrl('TKT-NOPE-000000')).set('Cookie', staffCookie).send({ currentStatus: 'FOO' });
    expect(unknown.status).toBe(400);
    const notFound = await request(app).patch(statusUrl('TKT-NOPE-000000')).set('Cookie', staffCookie).send({ currentStatus: 'OPEN' });
    expect(notFound.status).toBe(404);
    expect(notFound.body.error).toBe('NOT_FOUND');
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
    expect(bothBad.status).toBe(400);
    expect(bothBad.body.error).toBe('VALIDATION_ERROR');
    expect(Object.keys(bothBad.body.fields).sort()).toEqual(['currentStatus', 'expectedUpdatedAt']);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).currentStatus).toBe('WAITING_FOR_REQUESTER');
  });

  it('WF-05: a status changed between the read and the write is 409 STALE_UPDATE (locked-row re-check)', async () => {
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
    expect(Object.keys(res.body.current).sort()).toEqual(
      ['currentStatus', 'legalNextStatuses', 'requesterIndicatedResolved', 'resolvedAt', 'ticketNumber', 'updatedAt'].sort()
    );
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).currentStatus).toBe('WAITING_FOR_REQUESTER');
    expect(await historyCount(ticket.id)).toBe(0);
  });

  it('WF-05: on the locked row the status is re-checked before the owner (STALE_UPDATE, not UNASSIGNED_TICKET)', async () => {
    const ticket = await resolvable();
    const res = await raceAgainst(
      ticket.id,
      'UPDATE',
      (tx) => tx.ticket.update({ where: { id: ticket.id }, data: { currentStatus: 'WAITING_FOR_REQUESTER', ticketOwnerId: null } }),
      () => changeStatus(ticket.ticketNumber, { currentStatus: 'RESOLVED' })
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('STALE_UPDATE');
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

  // Outcome check under real parallelism. The read-then-write race itself is proven
  // deterministically by the forced-race WF-05 tests above (locked-row re-check).
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
    // BR-14: the indication survives resolve and close; only REOPENED clears it.
    expect(resolved.body.requesterIndicatedResolved).toBe(true);
    const closed = await changeStatus(ticket.ticketNumber, { currentStatus: 'CLOSED', expectedUpdatedAt: resolved.body.updatedAt });
    expect(closed.status).toBe(200);
    expect(closed.body.resolvedAt).toBe(resolved.body.resolvedAt);
    expect(closed.body.legalNextStatuses).toEqual(['REOPENED']);
    expect(closed.body.requesterIndicatedResolved).toBe(true);

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

    // RESOLVED -> REOPENED directly also clears resolvedAt and the indication.
    const direct = await resolvable();
    await prisma.ticket.update({ where: { id: direct.id }, data: { requesterIndicatedResolved: true } });
    expect((await changeStatus(direct.ticketNumber, { currentStatus: 'RESOLVED' })).status).toBe(200);
    const directReopen = await changeStatus(direct.ticketNumber, { currentStatus: 'REOPENED' });
    expect(directReopen.status).toBe(200);
    expect(directReopen.body.resolvedAt).toBeNull();
    expect(directReopen.body.requesterIndicatedResolved).toBe(false);
    expect(await historyCount(direct.id)).toBe(2);

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
    expect((await changeStatus(ticket.ticketNumber, { currentStatus: 'WAITING_FOR_REQUESTER' })).status).toBe(200);
    expect((await changeStatus(ticket.ticketNumber, { currentStatus: 'IN_PROGRESS' })).status).toBe(200);

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

    // AC-15: no endpoint deletes Status History.
    const del = await request(app).delete(statusUrl(ticket.ticketNumber)).set('Cookie', staffCookie);
    expect(del.status).toBe(404);
    expect(await historyCount(ticket.id)).toBe(2);

    const resolvedTicket = await createTicket(prisma, fx, { requesterId: fx.requesterA.id });
    await addAction(resolvedTicket.id, 'COMPLETED');
    const resolvedRes = await changeStatus(resolvedTicket.ticketNumber, { currentStatus: 'RESOLVED' });
    expect(resolvedRes.status).toBe(200);
    const requesterView = await request(app).get(`/api/tickets/${resolvedTicket.ticketNumber}`).set('Cookie', requesterCookie);
    expect(requesterView.body.resolvedAt).toBe(resolvedRes.body.resolvedAt);

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
      const cascadeAt = new Date(Date.now() + 1000);
      const body = route === 'status'
        ? { status: 'IN_PROGRESS', expectedUpdatedAt: action.updatedAt.toISOString() }
        : { description: 'Edited during a cancel', expectedUpdatedAt: action.updatedAt.toISOString() };
      const res = await raceAgainst(
        ticket.id,
        'UPDATE',
        // Same writes as the real cancel: ticket CANCELLED and the cascade on its open actions.
        async (tx) => {
          await tx.ticket.update({ where: { id: ticket.id }, data: { currentStatus: 'CANCELLED' } });
          await tx.actionTaken.update({ where: { id: action.id }, data: { status: 'CANCELLED', cancelledAt: cascadeAt, updatedAt: cascadeAt } });
        },
        () => request(app).patch(url).set('Cookie', staffCookie).send(body)
      );
      // The write passed its pre-checks (open action, fresh token) before blocking; after the
      // cancel it must answer TICKET_NOT_ACTIVE, not ACTION_LOCKED or STALE_UPDATE.
      expect(res.status, route).toBe(409);
      expect(res.body.error, route).toBe('TICKET_NOT_ACTIVE');
      const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } });
      expect(row.status, route).toBe('CANCELLED');
      expect(row.updatedAt.toISOString(), route).toBe(cascadeAt.toISOString());
    }
  });

  it('WF-09: cancelling a Ticket also cancels its open Actions Taken in the same change; finished actions are untouched', async () => {
    // A neighbour ticket with open actions must not be touched (BR-13 "its" open actions).
    const neighbour = await createTicket(prisma, fx);
    const nPlanned = await addAction(neighbour.id, 'PLANNED');
    const nStarted = await addAction(neighbour.id, 'IN_PROGRESS');
    const ticket = await createTicket(prisma, fx, { status: 'IN_PROGRESS' });
    const planned = await addAction(ticket.id, 'PLANNED', 90);
    const started = await addAction(ticket.id, 'IN_PROGRESS', 60);
    const done = await addAction(ticket.id, 'COMPLETED', 30);
    const dropped = await addAction(ticket.id, 'CANCELLED', 20);

    const res = await changeStatus(ticket.ticketNumber, { currentStatus: 'CANCELLED' });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe('CANCELLED');

    const rows = await prisma.actionTaken.findMany({ where: { ticketId: ticket.id }, orderBy: { id: 'asc' } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const open of [planned, started]) {
      const row = byId.get(open.id)!;
      expect(row.status).toBe('CANCELLED');
      expect(row.cancelledAt!.toISOString()).toBe(res.body.statusChange.changedAt);
      expect(row.updatedAt.toISOString()).toBe(res.body.statusChange.changedAt);
    }
    expect(byId.get(done.id)).toMatchObject({ status: 'COMPLETED', updatedAt: done.updatedAt, cancelledAt: null, completedAt: done.completedAt, result: done.result });
    expect(byId.get(dropped.id)).toMatchObject({ status: 'CANCELLED', updatedAt: dropped.updatedAt, cancelledAt: dropped.cancelledAt });

    // The cascade applies from every status that can move to CANCELLED.
    for (const from of ['NEW', 'OPEN', 'WAITING_FOR_REQUESTER', 'REOPENED'] as const) {
      const t = await createTicket(prisma, fx, { status: from });
      const a = await addAction(t.id, 'PLANNED');
      const cancelled = await changeStatus(t.ticketNumber, { currentStatus: 'CANCELLED' });
      expect(cancelled.status, from).toBe(200);
      const after = await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id } });
      expect(after.status, from).toBe('CANCELLED');
      expect(after.cancelledAt!.toISOString(), from).toBe(cancelled.body.statusChange.changedAt);
      expect(await historyCount(t.id), from).toBe(1);
    }

    // The serialized detail shows the cascade (staff and Requester).
    const staffDetail = await request(app).get(`/api/staff/tickets/${ticket.ticketNumber}`).set('Cookie', staffCookie);
    const own = await request(app).get(`/api/tickets/${ticket.ticketNumber}`).set('Cookie', await loginAs(fx.requesterA.email));
    const list = await request(app).get(`/api/staff/tickets/${ticket.ticketNumber}/actions`).set('Cookie', staffCookie);
    expect(list.body.data.find((a: { id: number }) => a.id === planned.id)).toMatchObject({ status: 'CANCELLED' });
    for (const detail of [staffDetail, own]) {
      const shown = detail.body.actionsTaken.find((a: { id: number }) => a.id === planned.id);
      expect(shown).toMatchObject({ status: 'CANCELLED', cancelledAt: res.body.statusChange.changedAt });
    }

    // A write sent after the cancel committed, with the pre-cancel token, is
    // TICKET_NOT_ACTIVE (checked before ACTION_LOCKED and STALE_UPDATE) and changes nothing.
    const actionUrl = `/api/staff/tickets/${ticket.ticketNumber}/actions/${planned.id}`;
    const token = planned.updatedAt.toISOString();
    const lateEdit = await request(app).patch(actionUrl).set('Cookie', staffCookie).send({ expectedUpdatedAt: token, description: 'late' });
    const lateStatus = await request(app).patch(`${actionUrl}/status`).set('Cookie', staffCookie).send({ status: 'IN_PROGRESS', expectedUpdatedAt: token });
    const fresh = res.body.statusChange.changedAt;
    const freshEdit = await request(app).patch(actionUrl).set('Cookie', staffCookie).send({ expectedUpdatedAt: fresh, description: 'late' });
    const freshStatus = await request(app).patch(`${actionUrl}/status`).set('Cookie', staffCookie).send({ status: 'IN_PROGRESS', expectedUpdatedAt: fresh });
    for (const late of [lateEdit, lateStatus, freshEdit, freshStatus]) {
      expect(late.status).toBe(409);
      expect(late.body.error).toBe('TICKET_NOT_ACTIVE');
    }
    expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: planned.id } })).updatedAt.toISOString()).toBe(res.body.statusChange.changedAt);
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id, status: { in: ['PLANNED', 'IN_PROGRESS'] } } })).toBe(0);
    expect(await historyCount(ticket.id)).toBe(1);
    for (const n of [nPlanned, nStarted]) {
      expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({
        status: n.status,
        updatedAt: n.updatedAt,
        cancelledAt: null,
      });
    }

    // Other transitions never touch actions (a representative walk through non-cancel moves).
    const other = await createTicket(prisma, fx, { status: 'NEW' });
    const stays = await addAction(other.id, 'PLANNED');
    for (const to of ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'IN_PROGRESS'] as const) {
      expect((await changeStatus(other.ticketNumber, { currentStatus: to })).status, to).toBe(200);
    }
    await prisma.ticket.update({ where: { id: other.id }, data: { currentStatus: 'REOPENED' } });
    expect((await changeStatus(other.ticketNumber, { currentStatus: 'WAITING_FOR_REQUESTER' })).status).toBe(200);
    expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: stays.id } })).toMatchObject({
      status: 'PLANNED',
      updatedAt: stays.updatedAt,
      cancelledAt: null,
    });
  }, 30_000); // ~30 requests (neighbour, five source statuses, detail, late writes, walk)

  it('WF-09: a failure after the cascade rolls everything back - status, actions and history (BR-13, BR-16 same transaction)', async () => {
    const ticket = await createTicket(prisma, fx);
    const open = await addAction(ticket.id, 'IN_PROGRESS');
    // Fault injection: a temporary trigger makes the history insert fail for this
    // ticket only, i.e. after the status update and the action cascade ran in the tx.
    const fn = `l4wf_fail_history_${ticket.id}`;
    await prisma.$executeRawUnsafe(
      // Raises only if the cascade already ran in this transaction, so a missing or
      // reordered cascade lets the insert succeed and the 500 assertion fails.
      `CREATE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN IF NEW."ticketId" = ${ticket.id} AND EXISTS (SELECT 1 FROM "ActionTaken" WHERE "ticketId" = NEW."ticketId" AND status = 'CANCELLED' AND "cancelledAt" IS NOT NULL) THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`
    );
    try {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER ${fn} BEFORE INSERT ON "TicketStatusChange" FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
      const res = await changeStatus(ticket.ticketNumber, { currentStatus: 'CANCELLED' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'INTERNAL_ERROR', message: expect.any(String) });
      expect(JSON.stringify(res.body)).not.toMatch(/injected failure|TicketStatusChange|plpgsql|at \S+\.ts/);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${fn} ON "TicketStatusChange"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.currentStatus).toBe('IN_PROGRESS');
    expect(row.updatedAt.toISOString()).toBe(ticket.updatedAt.toISOString());
    expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: open.id } })).toMatchObject({
      status: 'IN_PROGRESS',
      updatedAt: open.updatedAt,
      cancelledAt: null,
    });
    expect(await historyCount(ticket.id)).toBe(0);
  });

  it('WF-09: a cancel refused on the locked row (status changed while it waited) leaves the open actions untouched', async () => {
    const ticket = await createTicket(prisma, fx);
    const open = await addAction(ticket.id, 'PLANNED');
    const res = await raceAgainst(
      ticket.id,
      'UPDATE',
      (tx) => tx.ticket.update({ where: { id: ticket.id }, data: { currentStatus: 'WAITING_FOR_REQUESTER' } }),
      () => changeStatus(ticket.ticketNumber, { currentStatus: 'CANCELLED', expectedUpdatedAt: ticket.updatedAt.toISOString() })
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('STALE_UPDATE');
    expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: open.id } })).toMatchObject({
      status: 'PLANNED',
      updatedAt: open.updatedAt,
      cancelledAt: null,
    });
    expect(await historyCount(ticket.id)).toBe(0);

    // Without a token (Lab 3 clients) only the locked-row status re-check stops it.
    const noToken = await createTicket(prisma, fx);
    const open2 = await addAction(noToken.id, 'PLANNED');
    const res2 = await raceAgainst(
      noToken.id,
      'UPDATE',
      (tx) => tx.ticket.update({ where: { id: noToken.id }, data: { currentStatus: 'WAITING_FOR_REQUESTER' } }),
      () => changeStatus(noToken.ticketNumber, { currentStatus: 'CANCELLED' })
    );
    expect(res2.status).toBe(409);
    expect(res2.body.error).toBe('STALE_UPDATE');
    expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: open2.id } })).toMatchObject({ status: 'PLANNED', updatedAt: open2.updatedAt, cancelledAt: null });
    expect(await historyCount(noToken.id)).toBe(0);
  });

  it('WF-09: a new create (fresh key or no key) blocked behind a cancel is TICKET_NOT_ACTIVE and saves nothing', async () => {
    for (const key of [randomUUID(), undefined]) {
      const ticket = await createTicket(prisma, fx);
      const body = { actionAt: new Date(Date.now() - 60_000).toISOString(), description: 'New during cancel', followUpRequired: false, ...(key ? { clientRequestId: key } : {}) };
      const res = await raceAgainst(
        ticket.id,
        'UPDATE',
        (tx) => tx.ticket.update({ where: { id: ticket.id }, data: { currentStatus: 'CANCELLED' } }),
        () => request(app).post(`/api/staff/tickets/${ticket.ticketNumber}/actions`).set('Cookie', staffCookie).send(body)
      );
      expect(res.status, String(key)).toBe(409);
      expect(res.body.error, String(key)).toBe('TICKET_NOT_ACTIVE');
      expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } }), String(key)).toBe(0);
    }
  });

  it('WF-09: a retried create blocked behind a cancel that committed the original returns the replay, not TICKET_NOT_ACTIVE', async () => {
    const ticket = await createTicket(prisma, fx);
    const body = { actionAt: new Date(Date.now() - 60_000).toISOString(), description: 'Retried create', followUpRequired: false, clientRequestId: randomUUID() };
    let originalId!: number;
    const res = await raceAgainst(
      ticket.id,
      'UPDATE',
      // The original create committed and the ticket was cancelled (cascade) before the retry gets the lock.
      async (tx) => {
        const original = await tx.actionTaken.create({
          data: {
            ticketId: ticket.id, clientRequestId: body.clientRequestId, actionAt: new Date(body.actionAt),
            description: body.description, status: 'PLANNED', performedById: fx.staffA.id, createdById: fx.staffA.id,
          },
        });
        originalId = original.id;
        const at = new Date();
        await tx.ticket.update({ where: { id: ticket.id }, data: { currentStatus: 'CANCELLED' } });
        await tx.actionTaken.update({ where: { id: original.id }, data: { status: 'CANCELLED', cancelledAt: at, updatedAt: at } });
      },
      () => request(app).post(`/api/staff/tickets/${ticket.ticketNumber}/actions`).set('Cookie', staffCookie).send(body)
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: originalId, status: 'CANCELLED' });
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(1);

    // Same race, but the retry carries a different payload: IDEMPOTENCY_KEY_REUSED with the original.
    const other = await createTicket(prisma, fx);
    const otherBody = { ...body, clientRequestId: randomUUID() };
    let otherId!: number;
    const reused = await raceAgainst(
      other.id,
      'UPDATE',
      async (tx) => {
        const original = await tx.actionTaken.create({
          data: {
            ticketId: other.id, clientRequestId: otherBody.clientRequestId, actionAt: new Date(otherBody.actionAt),
            description: otherBody.description, status: 'PLANNED', performedById: fx.staffA.id, createdById: fx.staffA.id,
          },
        });
        otherId = original.id;
        const at = new Date();
        await tx.ticket.update({ where: { id: other.id }, data: { currentStatus: 'CANCELLED' } });
        await tx.actionTaken.update({ where: { id: original.id }, data: { status: 'CANCELLED', cancelledAt: at, updatedAt: at } });
      },
      () => request(app).post(`/api/staff/tickets/${other.ticketNumber}/actions`).set('Cookie', staffCookie).send({ ...otherBody, description: 'A different payload' })
    );
    expect(reused.status).toBe(409);
    expect(reused.body.error).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(reused.body.current).toMatchObject({ id: otherId, status: 'CANCELLED' });
    expect(await prisma.actionTaken.count({ where: { ticketId: other.id } })).toBe(1);
  });

  it('WF-09: an open action committed while the cancel waits on the lock is cancelled by it', async () => {
    const ticket = await createTicket(prisma, fx);
    let created!: { id: number };
    const res = await raceAgainst(
      ticket.id,
      'SHARE',
      async (tx) => {
        created = await tx.actionTaken.create({
          data: { ticketId: ticket.id, actionAt: new Date(), description: 'Started during the cancel', status: 'IN_PROGRESS', performedById: fx.staffA.id, createdById: fx.staffA.id },
        });
      },
      () => changeStatus(ticket.ticketNumber, { currentStatus: 'CANCELLED' })
    );
    expect(res.status).toBe(200);
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe('CANCELLED');
    expect(row.cancelledAt!.toISOString()).toBe(res.body.statusChange.changedAt);
    // Sanity check: the cascade timestamp is not before the action that committed meanwhile.
    expect(row.cancelledAt!.getTime()).toBeGreaterThanOrEqual(row.createdAt.getTime());
    expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(row.createdAt.getTime());
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id, status: { in: ['PLANNED', 'IN_PROGRESS'] } } })).toBe(0);
  });

  it('WF-09: on a RESOLVED, CLOSED or CANCELLED ticket, writes to a finished action are TICKET_NOT_ACTIVE (BR-10 before BR-09)', async () => {
    for (const status of ['RESOLVED', 'CLOSED', 'CANCELLED'] as const) {
      const ticket = await createTicket(prisma, fx, { status, resolvedAt: status === 'CANCELLED' ? null : new Date() });
      const done = await addAction(ticket.id, 'COMPLETED');
      const url = `/api/staff/tickets/${ticket.ticketNumber}/actions/${done.id}`;
      const token = done.updatedAt.toISOString();
      const edit = await request(app).patch(url).set('Cookie', staffCookie).send({ expectedUpdatedAt: token, description: 'x' });
      const move = await request(app).patch(`${url}/status`).set('Cookie', staffCookie).send({ status: 'CANCELLED', expectedUpdatedAt: token });
      const stale = await request(app).patch(url).set('Cookie', staffCookie).send({ expectedUpdatedAt: '2020-01-01T00:00:00.000Z', description: 'x' });
      const staleMove = await request(app).patch(`${url}/status`).set('Cookie', staffCookie).send({ status: 'CANCELLED', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' });
      for (const r of [edit, move, stale, staleMove]) {
        expect(r.status, status).toBe(409);
        expect(r.body.error, status).toBe('TICKET_NOT_ACTIVE');
      }
      expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: done.id } })).toMatchObject({
        status: 'COMPLETED',
        description: done.description,
        updatedAt: done.updatedAt,
      });
    }
  });

  it('WF-09: replaying a create after the cancel returns the original action in its current (cancelled) state', async () => {
    const ticket = await createTicket(prisma, fx);
    const body = { actionAt: new Date().toISOString(), description: 'Created before the cancel', followUpRequired: false, clientRequestId: randomUUID() };
    const first = await request(app).post(`/api/staff/tickets/${ticket.ticketNumber}/actions`).set('Cookie', staffCookie).send(body);
    expect(first.status).toBe(201);
    expect((await changeStatus(ticket.ticketNumber, { currentStatus: 'CANCELLED' })).status).toBe(200);
    const replay = await request(app).post(`/api/staff/tickets/${ticket.ticketNumber}/actions`).set('Cookie', staffCookie).send(body);
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ id: first.body.id, status: 'CANCELLED' });
    const afterCancel = await prisma.actionTaken.findUniqueOrThrow({ where: { id: first.body.id } });
    expect(replay.body.updatedAt).toBe(afterCancel.updatedAt.toISOString());
    expect(replay.body.cancelledAt).toBe(afterCancel.cancelledAt!.toISOString());
    // The idempotency rules are answered before TICKET_NOT_ACTIVE, also for a reused key.
    const reused = await request(app).post(`/api/staff/tickets/${ticket.ticketNumber}/actions`).set('Cookie', staffCookie).send({ ...body, description: 'Different' });
    expect(reused.status).toBe(409);
    expect(reused.body.error).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(reused.body.current).toMatchObject({ id: first.body.id, status: 'CANCELLED' });
    expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: first.body.id } })).updatedAt).toEqual(afterCancel.updatedAt);
    expect(await prisma.actionTaken.count({ where: { ticketId: ticket.id } })).toBe(1);
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
