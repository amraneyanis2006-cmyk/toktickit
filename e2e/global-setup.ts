// Playwright global setup: creates/resets a small set of deterministic E2E
// fixture accounts and tickets directly via Prisma, bypassing the app's own
// workflow (claim/status transitions). Runs before every test run and
// force-resets state each time (full upsert, not update:{}), so tests never
// depend on incidental data left over from manual testing or a previous run
// - the exact fragility flagged in docs/lab-02/reviewer.md (Remy's review on
// PR #11: hardcoded seed IDs/names break if the seed changes).
import { PrismaClient, Role, Priority, TicketStatus } from '@prisma/client';
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
  await prisma.ticket.deleteMany({ where: { requesterId: requesterB.id } });

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
