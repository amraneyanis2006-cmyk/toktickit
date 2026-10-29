// Playwright global setup: creates/resets a small set of deterministic E2E
// fixture accounts and tickets directly via Prisma, bypassing the app's own
// workflow (claim/status transitions). Runs before every test run and
// force-resets state each time (full upsert, not update:{}), so tests never
// depend on incidental data left over from manual testing or a previous run
// - the exact fragility flagged in docs/lab-02/reviewer.md (Remy's review on
// PR #11: hardcoded seed IDs/names break if the seed changes).
import { PrismaClient, Role, Priority, TicketStatus, ActionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();
const BCRYPT_COST = 12;

export const FIXTURE_PASSWORD = 'E2eFixturePass1!';

export const E2E_REQUESTER_A = { email: 'e2e-requester-a@example.com', name: 'E2E Requester A' };
export const E2E_REQUESTER_B = { email: 'e2e-requester-b@example.com', name: 'E2E Requester B' };
export const E2E_STAFF_A = { email: 'e2e-staff-a@example.com', name: 'E2E Staff A' };
export const E2E_STAFF_B = { email: 'e2e-staff-b@example.com', name: 'E2E Staff B' };
export const E2E_ADMIN = { email: 'e2e-admin@example.com', name: 'E2E Admin' };
export const E2E_INACTIVE = { email: 'e2e-inactive@example.com', name: 'E2E Inactive' };
export const E2E_MUST_CHANGE_LOGIN = { email: 'e2e-mustchange-login@example.com', name: 'E2E Must Change (Login)' };
export const E2E_MUST_CHANGE_VIEW = { email: 'e2e-mustchange-view@example.com', name: 'E2E Must Change (View)' };
export const E2E_MUST_CHANGE_INITIAL_PASSWORD = 'E2eMustChangeInit1!';

// Lab 4 fixtures (e2e/lab-04/*). A separate Requester and a TKT-L4E- prefix keep
// the Lab 2/3 fixtures above untouched.
export const E2E_REQUESTER_L4 = { email: 'e2e-requester-l4@example.com', name: 'E2E Requester L4' };
export const E2E_REQUESTER_EMPTY = { email: 'e2e-requester-empty@example.com', name: 'E2E Requester Empty' };
export const E2E_STAFF_IDLE = { email: 'e2e-staff-idle@example.com', name: 'E2E Staff Idle' };
/** Active IT Staff that a test deactivates mid-flow (E2E-02 / screenshots); reset to active every run. */
export const E2E_STAFF_LEAVING = { email: 'e2e-staff-leaving@example.com', name: 'E2E Staff Leaving' };
export const E2E_STAFF_LEAVING_SHOT = { email: 'e2e-staff-leaving-shot@example.com', name: 'E2E Staff Leaving (Shot)' };

/** One ticket per Lab 4 scenario, so parallel specs never share mutable state. */
export const L4 = {
  severalActions: 'TKT-L4E-000101', // read-only: one action in every status (+ follow-up)
  noAction: 'TKT-L4E-000102', // read-only: active, no action -> Resolved disabled
  awaitingReview: 'TKT-L4E-000103', // read-only: requesterIndicatedResolved
  lifecycle: 'TKT-L4E-000104', // E2E-03
  resolution: 'TKT-L4E-000105', // E2E-04
  requesterResolves: 'TKT-L4E-000106', // E2E-05
  stale: 'TKT-L4E-000107', // E2E-09 (one PLANNED action)
  saveFailure: 'TKT-L4E-000108', // FAIL-02
  inactiveAssignee: 'TKT-L4E-000109', // E2E-02
  keyboard: 'TKT-L4E-000110', // A11Y-01
  shotCreate: 'TKT-L4E-000201', // screenshots: validation + inactive assignee
  shotStale: 'TKT-L4E-000202', // screenshots: stale update (one PLANNED action)
  shotComplete: 'TKT-L4E-000203', // screenshots: complete + cancel dialog
  shotResolve: 'TKT-L4E-000204', // screenshots: RESOLUTION_BLOCKED, then resolve
  shotCancel: 'TKT-L4E-000205', // screenshots: ticket cancel dialog with an open action
} as const;

async function upsertFixtureUser(params: { name: string; email: string; role: Role; isActive?: boolean }) {
  const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, BCRYPT_COST);
  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      name: params.name,
      role: params.role,
      isActive: params.isActive ?? true,
      mustChangePassword: false,
      passwordHash,
    },
    create: {
      name: params.name,
      email: params.email,
      role: params.role,
      isActive: params.isActive ?? true,
      mustChangePassword: false,
      passwordHash,
    },
  });
}

/** Deletes a user's tickets with their Lab 4 rows (actions, status history) first (FK). */
async function deleteTicketsOf(requesterId: number) {
  const ids = (await prisma.ticket.findMany({ where: { requesterId }, select: { id: true } })).map((t) => t.id);
  await prisma.actionTaken.deleteMany({ where: { ticketId: { in: ids } } });
  await prisma.ticketStatusChange.deleteMany({ where: { ticketId: { in: ids } } });
  await prisma.attachment.deleteMany({ where: { ticketId: { in: ids } } });
  await prisma.ticketComment.deleteMany({ where: { ticketId: { in: ids } } });
  await prisma.ticketInternalNote.deleteMany({ where: { ticketId: { in: ids } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ids } } });
}

async function setupLab4(categoryId: number, relatedSystemId: number, staffAId: number) {
  const requester = await upsertFixtureUser({ ...E2E_REQUESTER_L4, role: Role.REQUESTER });
  const empty = await upsertFixtureUser({ ...E2E_REQUESTER_EMPTY, role: Role.REQUESTER });
  const idle = await upsertFixtureUser({ ...E2E_STAFF_IDLE, role: Role.IT_STAFF });
  await upsertFixtureUser({ ...E2E_STAFF_LEAVING, role: Role.IT_STAFF });
  await upsertFixtureUser({ ...E2E_STAFF_LEAVING_SHOT, role: Role.IT_STAFF });

  // Zero tickets for the empty Requester; zero actions for the idle staff member.
  await deleteTicketsOf(empty.id);
  await prisma.actionTaken.deleteMany({ where: { performedById: idle.id } });
  // Full reset of the Lab 4 tickets: recreate them from scratch every run.
  await deleteTicketsOf(requester.id);

  const day = 24 * 60 * 60 * 1000;
  const createdAt = new Date(Date.now() - 3 * day); // actions below must not predate the ticket (BR-06)
  const ticket = (ticketNumber: string, summary: string, extra: { requesterIndicatedResolved?: boolean } = {}) =>
    prisma.ticket.create({
      data: {
        ticketNumber, summary, requesterId: requester.id, ticketOwnerId: staffAId, categoryId, relatedSystemId,
        description: `${summary} - Lab 4 E2E fixture, recreated before every run.`,
        requestedPriority: Priority.MEDIUM, itPriority: Priority.HIGH, currentStatus: TicketStatus.IN_PROGRESS,
        createdAt, ...extra,
      },
    });
  const action = (ticketId: number, hoursAgo: number, status: ActionStatus, description: string, extra: Record<string, unknown> = {}) =>
    prisma.actionTaken.create({
      data: {
        ticketId, status, description, performedById: staffAId, createdById: staffAId,
        actionAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
        ...(status === ActionStatus.COMPLETED ? { result: `${description} - done.`, completedAt: new Date(Date.now() - (hoursAgo - 1) * 60 * 60 * 1000) } : {}),
        ...(status === ActionStatus.CANCELLED ? { cancelledAt: new Date(Date.now() - (hoursAgo - 1) * 60 * 60 * 1000) } : {}),
        ...extra,
      },
    });

  const several = await ticket(L4.severalActions, 'E2E L4: Wi-Fi drops in room 4.12');
  await action(several.id, 50, ActionStatus.COMPLETED, 'Checked the access point logs');
  await action(several.id, 40, ActionStatus.COMPLETED, 'Replaced the network cable', { attachmentNotes: 'cable-photo.jpg' });
  await action(several.id, 30, ActionStatus.CANCELLED, 'Order a new access point');
  await action(several.id, 20, ActionStatus.IN_PROGRESS, 'Monitor the connection for two days', { followUpRequired: true, followUpNote: 'Ask the Requester on Friday.' });
  await action(several.id, 10, ActionStatus.PLANNED, 'Update the access point firmware');

  await ticket(L4.noAction, 'E2E L4: Printer offline, no work recorded yet');
  await ticket(L4.awaitingReview, 'E2E L4: VPN fixed according to the Requester', { requesterIndicatedResolved: true });
  for (const [key, summary] of [
    ['lifecycle', 'E2E L4: Action lifecycle'], ['resolution', 'E2E L4: Resolution through the UI'],
    ['requesterResolves', 'E2E L4: Requester says resolved'], ['saveFailure', 'E2E L4: Save failure'],
    ['inactiveAssignee', 'E2E L4: Inactive assignee'], ['keyboard', 'E2E L4: Keyboard only'],
    ['shotCreate', 'E2E L4: Screenshot create panel'], ['shotResolve', 'E2E L4: Screenshot resolve'],
  ] as const) {
    const t = await ticket(L4[key], summary);
    if (key === 'shotResolve') await action(t.id, 5, ActionStatus.COMPLETED, 'Reset the user profile');
  }
  const stale = await ticket(L4.stale, 'E2E L4: Stale edit');
  await action(stale.id, 5, ActionStatus.PLANNED, 'Call the Requester back');
  const shotStale = await ticket(L4.shotStale, 'E2E L4: Screenshot stale update');
  await action(shotStale.id, 5, ActionStatus.PLANNED, 'Call the Requester back');
  const shotComplete = await ticket(L4.shotComplete, 'E2E L4: Screenshot complete and cancel');
  await action(shotComplete.id, 6, ActionStatus.IN_PROGRESS, 'Reinstall the VPN client');
  await action(shotComplete.id, 5, ActionStatus.PLANNED, 'Schedule a follow-up call');
  const shotCancel = await ticket(L4.shotCancel, 'E2E L4: Screenshot ticket cancel');
  await action(shotCancel.id, 5, ActionStatus.PLANNED, 'Wait for the replacement part');
}

export default async function globalSetup() {
  const [requesterA, requesterB, staffA, staffB, admin] = await Promise.all([
    upsertFixtureUser({ ...E2E_REQUESTER_A, role: Role.REQUESTER }),
    upsertFixtureUser({ ...E2E_REQUESTER_B, role: Role.REQUESTER }),
    upsertFixtureUser({ ...E2E_STAFF_A, role: Role.IT_STAFF }),
    upsertFixtureUser({ ...E2E_STAFF_B, role: Role.IT_STAFF }),
    upsertFixtureUser({ ...E2E_ADMIN, role: Role.ADMINISTRATOR }),
  ]);
  // A deactivated Requester, for the "cannot log in" / "excluded" E2E case
  // that used to be covered by the now-removed Development Requester selector.
  await upsertFixtureUser({ ...E2E_INACTIVE, role: Role.REQUESTER, isActive: false });

  // Two mustChangePassword:true accounts, kept separate so two tests that may
  // run in parallel (E2E-02, which SUBMITS a real password change, and
  // RESP-03's screenshots, which only ever VIEW the Change Password screen)
  // can never race on the same row.
  const mustChangeHash = await bcrypt.hash(E2E_MUST_CHANGE_INITIAL_PASSWORD, BCRYPT_COST);
  await prisma.user.upsert({
    where: { email: E2E_MUST_CHANGE_LOGIN.email },
    update: { name: E2E_MUST_CHANGE_LOGIN.name, role: Role.REQUESTER, isActive: true, mustChangePassword: true, passwordHash: mustChangeHash },
    create: { name: E2E_MUST_CHANGE_LOGIN.name, email: E2E_MUST_CHANGE_LOGIN.email, role: Role.REQUESTER, isActive: true, mustChangePassword: true, passwordHash: mustChangeHash },
  });
  await prisma.user.upsert({
    where: { email: E2E_MUST_CHANGE_VIEW.email },
    update: { name: E2E_MUST_CHANGE_VIEW.name, role: Role.REQUESTER, isActive: true, mustChangePassword: true, passwordHash: mustChangeHash },
    create: { name: E2E_MUST_CHANGE_VIEW.name, email: E2E_MUST_CHANGE_VIEW.email, role: Role.REQUESTER, isActive: true, mustChangePassword: true, passwordHash: mustChangeHash },
  });

  // Requester B stays with ZERO tickets on purpose (empty-state screenshots,
  // cross-Requester isolation target).
  await deleteTicketsOf(requesterB.id);

  const [category] = await prisma.category.findMany({ where: { isActive: true }, take: 1 });
  const [relatedSystem] = await prisma.relatedSystem.findMany({ where: { isActive: true }, take: 1 });
  if (!category || !relatedSystem) {
    throw new Error('global-setup: no active Category/RelatedSystem found - run prisma/seed.ts first.');
  }

  // Requester A: exactly one ticket per status (all 8), deterministic
  // priorities/owners, reset on every run. Covers every status/role badge
  // needed by ui-spec.md sec 12's screenshot checklist without depending on
  // whatever tickets happen to already exist in the database.
  const fixtureTickets: Array<{
    ticketNumber: string;
    status: TicketStatus;
    reqP: Priority;
    itP: Priority | null;
    ownerId: number | null;
    summary: string;
    resolved: boolean;
  }> = [
    { ticketNumber: 'TKT-E2E-000001', status: TicketStatus.NEW, reqP: Priority.MEDIUM, itP: null, ownerId: null, summary: 'E2E fixture: new, unassigned', resolved: false },
    { ticketNumber: 'TKT-E2E-000002', status: TicketStatus.OPEN, reqP: Priority.HIGH, itP: Priority.HIGH, ownerId: staffA.id, summary: 'E2E fixture: open', resolved: false },
    { ticketNumber: 'TKT-E2E-000003', status: TicketStatus.IN_PROGRESS, reqP: Priority.LOW, itP: Priority.LOW, ownerId: staffA.id, summary: 'E2E fixture: in progress, has comments/notes', resolved: false },
    { ticketNumber: 'TKT-E2E-000004', status: TicketStatus.WAITING_FOR_REQUESTER, reqP: Priority.MEDIUM, itP: Priority.MEDIUM, ownerId: staffB.id, summary: 'E2E fixture: waiting for requester', resolved: false },
    { ticketNumber: 'TKT-E2E-000005', status: TicketStatus.RESOLVED, reqP: Priority.HIGH, itP: Priority.HIGH, ownerId: staffA.id, summary: 'E2E fixture: resolved', resolved: true },
    { ticketNumber: 'TKT-E2E-000006', status: TicketStatus.CLOSED, reqP: Priority.LOW, itP: Priority.LOW, ownerId: staffB.id, summary: 'E2E fixture: closed', resolved: true },
    { ticketNumber: 'TKT-E2E-000007', status: TicketStatus.REOPENED, reqP: Priority.MEDIUM, itP: Priority.MEDIUM, ownerId: staffA.id, summary: 'E2E fixture: reopened', resolved: false },
    { ticketNumber: 'TKT-E2E-000008', status: TicketStatus.CANCELLED, reqP: Priority.LOW, itP: null, ownerId: null, summary: 'E2E fixture: cancelled', resolved: false },
  ];

  for (const t of fixtureTickets) {
    const ticket = await prisma.ticket.upsert({
      where: { ticketNumber: t.ticketNumber },
      update: {
        requesterId: requesterA.id,
        ticketOwnerId: t.ownerId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: t.summary,
        description: `${t.summary} - reset to a known state before every E2E run.`,
        requestedPriority: t.reqP,
        itPriority: t.itP,
        currentStatus: t.status,
        requesterIndicatedResolved: t.resolved,
      },
      create: {
        ticketNumber: t.ticketNumber,
        requesterId: requesterA.id,
        ticketOwnerId: t.ownerId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: t.summary,
        description: `${t.summary} - reset to a known state before every E2E run.`,
        requestedPriority: t.reqP,
        itPriority: t.itP,
        currentStatus: t.status,
        requesterIndicatedResolved: t.resolved,
      },
    });

    // Reset comments/notes on the one ticket that carries them, so a re-run
    // never accumulates duplicates.
    if (t.ticketNumber === 'TKT-E2E-000003') {
      await prisma.ticketComment.deleteMany({ where: { ticketId: ticket.id } });
      await prisma.ticketInternalNote.deleteMany({ where: { ticketId: ticket.id } });
      await prisma.ticketComment.create({
        data: { ticketId: ticket.id, authorId: requesterA.id, content: 'E2E fixture public comment from the Requester.' },
      });
      await prisma.ticketComment.create({
        data: { ticketId: ticket.id, authorId: staffA.id, content: 'E2E fixture public comment from IT Staff.' },
      });
      await prisma.ticketInternalNote.create({
        data: { ticketId: ticket.id, authorId: staffA.id, content: 'E2E fixture internal note - staff only.' },
      });
    }
  }

  await setupLab4(category.id, relatedSystem.id, staffA.id);

  console.log(`E2E global setup complete: requesterA=${requesterA.id}, requesterB=${requesterB.id}, staffA=${staffA.id}, staffB=${staffB.id}, admin=${admin.id}`);
  await prisma.$disconnect();
}

// Allows `npx tsx e2e/global-setup.ts` to run this directly for manual
// verification. Playwright itself imports the default export and calls it,
// so this guard never double-runs during a real test invocation.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  globalSetup()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('global-setup failed:', err);
      process.exit(1);
    });
}
