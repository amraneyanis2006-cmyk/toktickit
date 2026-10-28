// prisma/seed.ts — Lab 4, idempotent (safe to re-run).
// Seeds: 5 active + 1 inactive Requester (one with no Ticket), 3 active +
// 1 inactive IT Staff, 1 active Administrator, realistic Tickets/Comments/
// Notes, and the Lab 4 Actions Taken / Status History data (spec sec 7.2).
// LOCAL DEVELOPMENT ONLY. Printed passwords are never real credentials.

import { PrismaClient, Role, Priority, TicketStatus, ActionStatus } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { generateTicketNumber } from "../server/src/utils/ticketNumber";
import {
  SEED_REQUESTERS,
  SEED_EMPTY_REQUESTER,
  SEED_STAFF,
  SEED_ADMIN,
  SEED_CATEGORY_NAMES,
  SEED_SYSTEM_NAMES,
  SEED_ACTION_KEY_PREFIX,
  seedActionKey,
} from "./seedData";

const prisma = new PrismaClient();
const BCRYPT_COST = 12;
const SEED_PASSWORD = "DevPass123!"; // same for every seeded account, local only

async function upsertStaffUser(params: {
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}) {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_COST);
  return prisma.user.upsert({
    where: { email: params.email },
    update: {},
    create: {
      name: params.name,
      email: params.email,
      role: params.role,
      isActive: params.isActive,
      passwordHash,
      mustChangePassword: false, // seeded accounts are ready to use immediately
    },
  });
}

async function main() {
  // --- Requesters ---
  // On an already-migrated DB (Lab 2 -> Lab 3, via
  // scripts/migrate-lab2-passwords.ts), these 4 active + 1 inactive rows
  // already exist with their real migrated passwordHash/mustChangePassword
  // state (BR-24, BR-25) - update: {} below leaves them completely untouched.
  // On a genuinely FRESH clone (no prior Lab 2 data - e.g. a grader running
  // `npx prisma migrate deploy && npx prisma db seed` from scratch), no
  // migration ever inserts these rows (migrations only change schema, never
  // data), so they must be created here as a fallback, or this script
  // crashes - the exact DoD "clean clone" scenario this project must
  // support end-to-end. Fresh-created accounts get mustChangePassword:false
  // like the seeded Staff/Admin accounts, since they were never migrated.
  const REQUESTER_SEED_DEFAULTS: Array<{ name: string; email: string; isActive: boolean }> = SEED_REQUESTERS;

  const allRequesterRows = await Promise.all(
    REQUESTER_SEED_DEFAULTS.map(async (r) => {
      const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_COST);
      return prisma.user.upsert({
        where: { email: r.email },
        update: {}, // never touch an already-migrated row
        create: {
          name: r.name,
          email: r.email,
          role: Role.REQUESTER,
          isActive: r.isActive,
          passwordHash,
          mustChangePassword: false,
        },
      });
    })
  );
  // Ticket assignment below only ever used the 4 active ones.
  const requesters = allRequesterRows.filter((r) => r.isActive);

  // --- IT Staff (3 active + 1 inactive) — new role, no Lab 2 equivalent ---
  const staff = await Promise.all(SEED_STAFF.map((s) => upsertStaffUser({ ...s, role: Role.IT_STAFF })));

  // --- Administrator (1 active) ---
  const [admin] = await Promise.all([upsertStaffUser({ ...SEED_ADMIN, role: Role.ADMINISTRATOR })]);

  // --- Reference data (idempotent) ---
  const [access, hardware, software, network] = await Promise.all(
    SEED_CATEGORY_NAMES.map((name) => prisma.category.upsert({ where: { name }, update: {}, create: { name } }))
  );
  const [laptop, wifi, email, vpn, leb2, gradeApp, printer] = await Promise.all(
    SEED_SYSTEM_NAMES.map((name) => prisma.relatedSystem.upsert({ where: { name }, update: {}, create: { name } }))
  );

  // --- Realistic Tickets across statuses / priorities / ownership ---
  const ticketSeeds = [
    { requester: requesters[0], owner: null, status: TicketStatus.NEW, reqP: Priority.MEDIUM, itP: null, category: hardware, system: laptop, summary: "Laptop battery drains quickly" },
    { requester: requesters[1], owner: staff[0], status: TicketStatus.IN_PROGRESS, reqP: Priority.HIGH, itP: Priority.HIGH, category: network, system: wifi, summary: "Cannot connect to campus Wi-Fi" },
    { requester: requesters[2], owner: staff[1], status: TicketStatus.WAITING_FOR_REQUESTER, reqP: Priority.LOW, itP: Priority.LOW, category: software, system: laptop, summary: "Need software license reactivated" },
    { requester: requesters[0], owner: staff[0], status: TicketStatus.RESOLVED, reqP: Priority.MEDIUM, itP: Priority.MEDIUM, category: hardware, system: laptop, summary: "Keyboard keys sticking" },
    { requester: requesters[3], owner: null, status: TicketStatus.OPEN, reqP: Priority.HIGH, itP: Priority.HIGH, category: network, system: wifi, summary: "VPN drops every few minutes" },
    { requester: requesters[1], owner: staff[2], status: TicketStatus.CLOSED, reqP: Priority.LOW, itP: Priority.LOW, category: software, system: laptop, summary: "Printer driver installation" },
    { requester: requesters[3], owner: staff[2], status: TicketStatus.REOPENED, reqP: Priority.HIGH, itP: Priority.HIGH, category: access, system: email, summary: "Cannot access email after password reset" },
    { requester: requesters[0], owner: null, status: TicketStatus.CANCELLED, reqP: Priority.LOW, itP: Priority.LOW, category: software, system: gradeApp, summary: "Grade Submission App feature request - duplicate" },
  ];

  let seq = 1;
  for (const t of ticketSeeds) {
    const ticketNumber = `TKT-2026-${String(seq).padStart(6, "0")}`;
    const existing = await prisma.ticket.findUnique({ where: { ticketNumber } });
    if (existing) {
      seq++;
      continue;
    }
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        requesterId: t.requester.id,
        ticketOwnerId: t.owner?.id ?? null,
        categoryId: t.category.id,
        relatedSystemId: t.system.id,
        summary: t.summary,
        description: `${t.summary} — seeded description with enough detail to pass validation (10-2000 chars).`,
        requestedPriority: t.reqP,
        itPriority: t.itP ?? undefined,
        currentStatus: t.status,
      },
    });

    if (t.owner) {
      await prisma.ticketComment.create({
        data: {
          ticketId: ticket.id,
          authorId: t.requester.id,
          content: "Thanks for looking into this — let me know if you need more info.",
        },
      });
      await prisma.ticketInternalNote.create({
        data: {
          ticketId: ticket.id,
          authorId: t.owner.id,
          content: "Checked known issues list, nothing matching yet. Monitoring.",
        },
      });
    }
    seq++;
  }

  // Sync the real ticket-numbering sequence (used by generateTicketNumber() for
  // every ticket created through the live API) with the highest number this
  // seed's own hardcoded TKT-2026-* tickets consume. Without this, the sequence
  // starts at 0/whatever it already was and the very next real ticket-creation
  // calls collide with these seeded ticketNumbers (P2002 unique constraint) -
  // found via a genuine clean-clone DoD verification: on a freshly seeded
  // database, the first 3 real ticket-creation attempts failed outright (the
  // route's retry budget is 3 attempts, and 8 seeded numbers were in the way).
  // Only ever ADVANCES the counter, never rewinds it - a database with real
  // tickets already past this range (any non-fresh, actively used database)
  // is left untouched, so this stays safe to re-run.
  const highestSeededTicketSeq = seq - 1; // ticketSeeds.length, i.e. 8
  const existingSequence = await prisma.ticketSequence.findUnique({ where: { year: 2026 } });
  const targetLastSeq = Math.max(existingSequence?.lastSeq ?? 0, highestSeededTicketSeq);
  await prisma.ticketSequence.upsert({
    where: { year: 2026 },
    create: { year: 2026, lastSeq: targetLastSeq },
    update: { lastSeq: targetLastSeq },
  });

  const lab4 = await seedLab4({
    requesters,
    staff,
    categories: { access, hardware, software, network },
    systems: { laptop, wifi, email, vpn },
  });

  console.log("Lab 4 seed complete.");
  console.log(`  Requesters: ${requesters.length} active (already-migrated Lab 2 accounts left untouched, or freshly seeded as fallback on a clean database)`);
  console.log(`  IT Staff:   ${staff.length} (1 inactive)`);
  console.log(`  Admin:      1 (${admin.email})`);
  console.log(`  Lab 4:      ${lab4.tickets} tickets (${lab4.created} created this run), ${lab4.actions} Actions Taken; ${lab4.emptyRequester} has no ticket`);
  console.log(`  All seeded accounts use password: ${SEED_PASSWORD} (local dev only)`);
}

// --------------------------------------------------------------------------
// Lab 4 seed data (docs/lab-04/specification.md sec 7.2).
// Lab 4 tickets get normal TKT-YYYY-NNNNNN numbers from the live ticket
// sequence (generateTicketNumber, as POST /api/tickets). Each has a stable
// seed key and at least one Action Taken keyed seed-<key>-<n>: a re-run finds
// the ticket again through its first action key and creates nothing. The
// ticket, its actions and its Status History are written in ONE nested create,
// so a crash can never leave a ticket that the next run would not recognise.
// Zero-action tickets are the legacy seed tickets above (no Lab 4 actions).
// Dates are relative to the first run.
// --------------------------------------------------------------------------
type SeedUser = { id: number };
type SeedRef = { id: number };

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

interface Lab4ActionSeed {
  at: number; // offset from now, ms (negative = past)
  description: string;
  status: ActionStatus;
  performedBy: SeedUser;
  createdBy: SeedUser;
  result?: string;
  followUpNote?: string;
  attachmentNotes?: string;
}

interface Lab4TicketSeed {
  key: string; // stable seed key, never shown in the app
  requester: SeedUser;
  owner: SeedUser | null;
  status: TicketStatus;
  reqP: Priority;
  itP: Priority | null;
  category: SeedRef;
  system: SeedRef;
  summary: string;
  createdAgo: number;
  resolvedAgo?: number;
  requesterIndicatedResolved?: boolean;
  history: Array<{ from: TicketStatus; to: TicketStatus; ago: number; by: SeedUser }>;
  actions: Lab4ActionSeed[];
}

async function seedLab4(ctx: {
  requesters: SeedUser[];
  staff: SeedUser[];
  categories: Record<"access" | "hardware" | "software" | "network", SeedRef>;
  systems: Record<"laptop" | "wifi" | "email" | "vpn", SeedRef>;
}) {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_COST);
  const emptyRequester = await prisma.user.upsert({
    where: { email: SEED_EMPTY_REQUESTER.email },
    update: {},
    create: { ...SEED_EMPTY_REQUESTER, role: Role.REQUESTER, passwordHash, mustChangePassword: false },
  });

  const [jennifer, michael, , david] = ctx.requesters;
  // Somsak (staff[2]) only has COMPLETED actions: the "no open action" staff dashboard.
  const [alex, priya, somsak] = ctx.staff;
  const { access, software, network } = ctx.categories;
  const { laptop, wifi, email, vpn } = ctx.systems;

  const tickets: Lab4TicketSeed[] = [
    {
      key: "wifi-certificate", requester: jennifer, owner: alex, status: TicketStatus.IN_PROGRESS, reqP: Priority.HIGH, itP: Priority.HIGH,
      category: network, system: wifi, summary: "Wi-Fi certificate expired on several lab laptops", createdAgo: 3 * DAY,
      history: [{ from: TicketStatus.NEW, to: TicketStatus.IN_PROGRESS, ago: 3 * DAY - 2 * HOUR, by: alex }],
      actions: [
        { at: -3 * DAY + 3 * HOUR, description: "Checked the RADIUS logs for the affected laptops.", status: ActionStatus.COMPLETED,
          performedBy: alex, createdBy: alex, result: "Certificates expired on 4 laptops; others are fine." },
        { at: -2 * DAY, description: "Re-enrol the Wi-Fi certificate on the 4 laptops.", status: ActionStatus.IN_PROGRESS,
          performedBy: priya, createdBy: alex, attachmentNotes: "See attachment wifi-error.png" },
        { at: -1 * DAY, description: "Confirm the certificate auto-renewal policy with the network team.", status: ActionStatus.PLANNED,
          performedBy: alex, createdBy: alex, followUpNote: "Check again on Friday that the certificate auto-renews." },
      ],
    },
    {
      key: "stats-licence", requester: michael, owner: priya, status: TicketStatus.OPEN, reqP: Priority.MEDIUM, itP: Priority.MEDIUM,
      category: software, system: laptop, summary: "Statistics software asks for a licence again", createdAgo: 2 * DAY,
      history: [{ from: TicketStatus.NEW, to: TicketStatus.OPEN, ago: 2 * DAY - HOUR, by: priya }],
      actions: [
        { at: -1 * DAY, description: "Request a new licence key from the vendor portal.", status: ActionStatus.PLANNED,
          performedBy: priya, createdBy: priya },
      ],
    },
    {
      key: "shared-mailbox", requester: david, owner: alex, status: TicketStatus.RESOLVED, reqP: Priority.HIGH, itP: Priority.HIGH,
      category: access, system: email, summary: "Shared mailbox not visible after migration", createdAgo: 5 * DAY, resolvedAgo: 2 * DAY,
      history: [
        { from: TicketStatus.NEW, to: TicketStatus.IN_PROGRESS, ago: 4 * DAY, by: alex },
        { from: TicketStatus.IN_PROGRESS, to: TicketStatus.RESOLVED, ago: 2 * DAY, by: alex },
      ],
      actions: [
        { at: -4 * DAY, description: "Re-add the mailbox permission through the admin console.", status: ActionStatus.CANCELLED,
          performedBy: alex, createdBy: alex },
        { at: -3 * DAY, description: "Re-created the mailbox delegation and restarted the client.", status: ActionStatus.COMPLETED,
          performedBy: alex, createdBy: alex, result: "Mailbox visible again for the requester." },
      ],
    },
    {
      key: "vpn-client", requester: jennifer, owner: somsak, status: TicketStatus.CLOSED, reqP: Priority.LOW, itP: Priority.LOW,
      category: network, system: vpn, summary: "VPN client update needed", createdAgo: 25 * DAY, resolvedAgo: 20 * DAY,
      history: [
        { from: TicketStatus.NEW, to: TicketStatus.IN_PROGRESS, ago: 24 * DAY, by: somsak },
        { from: TicketStatus.IN_PROGRESS, to: TicketStatus.RESOLVED, ago: 20 * DAY, by: somsak },
        { from: TicketStatus.RESOLVED, to: TicketStatus.CLOSED, ago: 18 * DAY, by: somsak },
      ],
      actions: [
        { at: -21 * DAY, description: "Installed the new VPN client version.", status: ActionStatus.COMPLETED,
          performedBy: somsak, createdBy: somsak, result: "VPN connects with the new client.", attachmentNotes: "vpn-version.png" },
      ],
    },
    {
      key: "printer-driver", requester: jennifer, owner: priya, status: TicketStatus.WAITING_FOR_REQUESTER, reqP: Priority.MEDIUM, itP: Priority.LOW,
      category: software, system: laptop, summary: "Printer driver missing after OS update", createdAgo: 4 * DAY,
      requesterIndicatedResolved: true,
      history: [
        { from: TicketStatus.NEW, to: TicketStatus.IN_PROGRESS, ago: 4 * DAY - HOUR, by: priya },
        { from: TicketStatus.IN_PROGRESS, to: TicketStatus.WAITING_FOR_REQUESTER, ago: 1 * DAY, by: priya },
      ],
      actions: [
        { at: -2 * DAY, description: "Reinstalled the printer driver package.", status: ActionStatus.COMPLETED,
          performedBy: priya, createdBy: priya, result: "Test page printed successfully." },
      ],
    },
    {
      key: "two-factor", requester: jennifer, owner: alex, status: TicketStatus.WAITING_FOR_REQUESTER, reqP: Priority.HIGH, itP: Priority.HIGH,
      category: access, system: email, summary: "Two-factor prompt never arrives", createdAgo: 2 * DAY,
      history: [{ from: TicketStatus.NEW, to: TicketStatus.WAITING_FOR_REQUESTER, ago: 1 * DAY, by: alex }],
      actions: [
        { at: -1 * DAY - 2 * HOUR, description: "Re-sent the two-factor enrolment link to the requester.", status: ActionStatus.COMPLETED,
          performedBy: alex, createdBy: alex, result: "Link sent; waiting for the requester to confirm the prompt arrives." },
      ],
    },
  ];

  const now = Date.now();
  let actionCount = 0;
  let created = 0;

  for (const t of tickets) {
    actionCount += t.actions.length;
    const firstKey = seedActionKey(t.key, 1);
    const existing = await prisma.actionTaken.findFirst({ where: { clientRequestId: firstKey }, select: { ticketId: true } });
    if (existing) continue;

    const ticketNumber = await generateTicketNumber();
    await prisma.ticket.create({
      data: {
        ticketNumber,
        requesterId: t.requester.id,
        ticketOwnerId: t.owner?.id ?? null,
        categoryId: t.category.id,
        relatedSystemId: t.system.id,
        summary: t.summary,
        description: `${t.summary} — seeded Lab 4 description with enough detail to pass validation.`,
        requestedPriority: t.reqP,
        itPriority: t.itP,
        currentStatus: t.status,
        requesterIndicatedResolved: t.requesterIndicatedResolved ?? false,
        createdAt: new Date(now - t.createdAgo),
        resolvedAt: t.resolvedAgo !== undefined ? new Date(now - t.resolvedAgo) : null,
        statusChanges: {
          create: t.history.map((h) => ({
            fromStatus: h.from,
            toStatus: h.to,
            changedById: h.by.id,
            changedAt: new Date(now - h.ago),
          })),
        },
        actionsTaken: {
          create: t.actions.map((a, i) => {
            const finishedAt = new Date(now + a.at + HOUR);
            return {
              clientRequestId: seedActionKey(t.key, i + 1),
              actionAt: new Date(now + a.at),
              description: a.description,
              result: a.result ?? null,
              status: a.status,
              performedById: a.performedBy.id,
              createdById: a.createdBy.id,
              followUpRequired: a.followUpNote !== undefined,
              followUpNote: a.followUpNote ?? null,
              attachmentNotes: a.attachmentNotes ?? null,
              completedAt: a.status === ActionStatus.COMPLETED ? finishedAt : null,
              cancelledAt: a.status === ActionStatus.CANCELLED ? finishedAt : null,
            };
          }),
        },
      },
    });
    created++;
  }

  return { tickets: tickets.length, created, actions: actionCount, emptyRequester: emptyRequester.email };
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
