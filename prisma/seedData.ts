// prisma/seedData.ts - stable keys of everything prisma/seed.ts creates, shared
// with the seed-idempotency test (server/tests/lab-04/migration.api.test.ts,
// MIG-04) so it can count exactly the seeded rows.

export const SEED_REQUESTERS = [
  { name: "Jennifer Anderson", email: "jennifer.anderson@toktickit.test", isActive: true },
  { name: "Michael Brown", email: "michael.brown@toktickit.test", isActive: true },
  { name: "Sarah Johnson", email: "sarah.johnson@toktickit.test", isActive: true },
  { name: "David Lee", email: "david.lee@toktickit.test", isActive: true },
  { name: "Robert Wilson", email: "robert.wilson@toktickit.test", isActive: false },
];

/** Lab 4 sec 7.2: an active Requester with no Ticket at all (empty dashboard). */
export const SEED_EMPTY_REQUESTER = { name: "Nina Patel", email: "nina.patel@toktickit.test", isActive: true };

export const SEED_STAFF = [
  { name: "Alex Kim", email: "alex.kim@example.com", isActive: true },
  { name: "Priya Nandi", email: "priya.nandi@example.com", isActive: true },
  { name: "Somsak Charoen", email: "somsak.charoen@example.com", isActive: true },
  { name: "Retired Tech", email: "retired.tech@example.com", isActive: false },
];

export const SEED_ADMIN = { name: "Toey Ua-areemitr", email: "admin@example.com", isActive: true };

export const SEED_ACCOUNT_EMAILS = [
  ...SEED_REQUESTERS.map((r) => r.email),
  SEED_EMPTY_REQUESTER.email,
  ...SEED_STAFF.map((s) => s.email),
  SEED_ADMIN.email,
];

export const SEED_CATEGORY_NAMES = ["Account and Access", "Hardware", "Software", "Network"];

export const SEED_SYSTEM_NAMES = [
  "Corporate Laptop",
  "Campus Wi-Fi",
  "Email",
  "VPN",
  "LEB2 App",
  "Grade Submission App",
  "Printer",
];

/** Lab 2/3 seed tickets TKT-2026-000001..000008. */
export const LEGACY_SEED_TICKET_NUMBERS = Array.from(
  { length: 8 },
  (_, i) => `TKT-2026-${String(i + 1).padStart(6, "0")}`
);

/**
 * Lab 4 seed tickets get their own number range, outside the live
 * TKT-2026-NNNNNN sequence, so seeding never collides with (or attaches
 * actions to) Tickets created through the app.
 */
export const LAB4_SEED_TICKET_PREFIX = "TKT-2026-L4-";

/** Actions Taken are keyed seed-<ticketNumber>-<n> and upserted on [ticketId, clientRequestId]. */
export const SEED_ACTION_KEY_PREFIX = "seed-";
