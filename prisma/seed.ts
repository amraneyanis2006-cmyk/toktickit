// prisma/seed.ts — Lab 3, idempotent (safe to re-run).
// Seeds: 4 active + 1 inactive Requester, 3 active + 1 inactive IT Staff,
// 1 active Administrator, plus realistic Tickets/Comments/Notes.
// LOCAL DEVELOPMENT ONLY. Printed passwords are never real credentials.

import { PrismaClient, Role, Priority, TicketStatus } from "@prisma/client";
import * as bcrypt from "bcrypt";

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
  const REQUESTER_SEED_DEFAULTS: Array<{ name: string; email: string; isActive: boolean }> = [
    { name: "Jennifer Anderson", email: "jennifer.anderson@toktickit.test", isActive: true },
    { name: "Michael Brown", email: "michael.brown@toktickit.test", isActive: true },
    { name: "Sarah Johnson", email: "sarah.johnson@toktickit.test", isActive: true },
    { name: "David Lee", email: "david.lee@toktickit.test", isActive: true },
    { name: "Robert Wilson", email: "robert.wilson@toktickit.test", isActive: false },
  ];

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
  const staff = await Promise.all([
    upsertStaffUser({ name: "Alex Kim", email: "alex.kim@example.com", role: Role.IT_STAFF, isActive: true }),
    upsertStaffUser({ name: "Priya Nandi", email: "priya.nandi@example.com", role: Role.IT_STAFF, isActive: true }),
    upsertStaffUser({ name: "Somsak Charoen", email: "somsak.charoen@example.com", role: Role.IT_STAFF, isActive: true }),
    upsertStaffUser({ name: "Retired Tech", email: "retired.tech@example.com", role: Role.IT_STAFF, isActive: false }),
  ]);

  // --- Administrator (1 active) ---
  const [admin] = await Promise.all([
    upsertStaffUser({ name: "Toey Ua-areemitr", email: "admin@example.com", role: Role.ADMINISTRATOR, isActive: true }),
  ]);

  // --- Reference data (idempotent) ---
  const [access, hardware, software, network] = await Promise.all([
    prisma.category.upsert({ where: { name: "Account and Access" }, update: {}, create: { name: "Account and Access" } }),
    prisma.category.upsert({ where: { name: "Hardware" }, update: {}, create: { name: "Hardware" } }),
    prisma.category.upsert({ where: { name: "Software" }, update: {}, create: { name: "Software" } }),
    prisma.category.upsert({ where: { name: "Network" }, update: {}, create: { name: "Network" } }),
  ]);
  const [laptop, wifi, email, vpn, leb2, gradeApp, printer] = await Promise.all([
    prisma.relatedSystem.upsert({ where: { name: "Corporate Laptop" }, update: {}, create: { name: "Corporate Laptop" } }),
    prisma.relatedSystem.upsert({ where: { name: "Campus Wi-Fi" }, update: {}, create: { name: "Campus Wi-Fi" } }),
    prisma.relatedSystem.upsert({ where: { name: "Email" }, update: {}, create: { name: "Email" } }),
    prisma.relatedSystem.upsert({ where: { name: "VPN" }, update: {}, create: { name: "VPN" } }),
    prisma.relatedSystem.upsert({ where: { name: "LEB2 App" }, update: {}, create: { name: "LEB2 App" } }),
    prisma.relatedSystem.upsert({ where: { name: "Grade Submission App" }, update: {}, create: { name: "Grade Submission App" } }),
    prisma.relatedSystem.upsert({ where: { name: "Printer" }, update: {}, create: { name: "Printer" } }),
  ]);

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

  console.log("Lab 3 seed complete.");
  console.log(`  Requesters: ${requesters.length} active (already-migrated Lab 2 accounts left untouched, or freshly seeded as fallback on a clean database)`);
  console.log(`  IT Staff:   ${staff.length} (1 inactive)`);
  console.log(`  Admin:      1 (${admin.email})`);
  console.log(`  All seeded accounts use password: ${SEED_PASSWORD} (local dev only)`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
