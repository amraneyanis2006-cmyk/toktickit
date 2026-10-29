// scripts/lab4-metrics-check.ts - Lab 4 evidence (tests.md sec 11, AC-16).
// Logs in through the API as a Requester, an IT Staff member and an
// Administrator, reads both dashboards, runs the equivalent raw SQL for every
// metric, and prints "metric | API | SQL | match". Exits 1 on any mismatch.
// Runs the Express app in-process (supertest), so no dev server is needed.
//   npm run lab4:metrics-check > artifacts/lab-04/metrics-check.txt

import request from "supertest";
import { PrismaClient } from "@prisma/client";
import appModule from "../server/src/app";

// The server is CommonJS and this root package is ESM: unwrap the default export.
const app = ((appModule as unknown as { default?: typeof appModule }).default ?? appModule) as typeof appModule;

const prisma = new PrismaClient();
// Set LAB4_CHECK_PASSWORD to override; the fallback is the README dev seed password (local only).
const PASSWORD = process.env.LAB4_CHECK_PASSWORD ?? "DevPass123!";
const ACTIVE = `('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')`;
const STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];

async function login(email: string) {
  const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  const cookie = ([] as string[]).concat(res.headers["set-cookie"] ?? [])[0];
  if (res.status !== 200 || !cookie) throw new Error(`Login failed for ${email}: ${res.status}`);
  return { cookie, id: res.body.id as number };
}

async function count(sql: string, ...params: unknown[]) {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n ${sql}`, ...params);
  return rows[0]!.n;
}

async function main() {
  const rows: Array<[string, number, number]> = [];
  const notes: string[] = [];
  const add = async (metric: string, api: number, sql: string, ...params: unknown[]) => rows.push([metric, api, await count(sql, ...params)]);

  const requester = await login("jennifer.anderson@toktickit.test"); // seeded Requester with Lab 4 tickets (README dev accounts)
  const r = (await request(app).get("/api/dashboard/requester").set("Cookie", requester.cookie)).body;
  const mine = `FROM "Ticket" WHERE "requesterId" = $1 AND`;
  await add("requester.openTickets", r.metrics.openTickets.value, `${mine} "currentStatus" IN ${ACTIVE}`, requester.id);
  await add("requester.waitingForMe", r.metrics.waitingForMe.value, `${mine} "currentStatus" = 'WAITING_FOR_REQUESTER'`, requester.id);
  await add("requester.resolvedLast7Days", r.metrics.resolvedLast7Days.value,
    `${mine} "currentStatus" IN ('RESOLVED','CLOSED') AND "resolvedAt" >= now() - interval '7 days'`, requester.id);
  await add("requester.closedTickets", r.metrics.closedTickets.value, `${mine} "currentStatus" = 'CLOSED'`, requester.id);

  for (const email of ["alex.kim@example.com", "admin@example.com"]) {
    const staff = await login(email);
    const s = (await request(app).get("/api/dashboard/staff").set("Cookie", staff.cookie)).body;
    const who = email.split("@")[0];
    await add(`${who}.unassignedOpen`, s.metrics.unassignedOpen.value, `FROM "Ticket" WHERE "ticketOwnerId" IS NULL AND "currentStatus" IN ${ACTIVE}`);
    await add(`${who}.myOpenTickets`, s.metrics.myOpenTickets.value, `FROM "Ticket" WHERE "ticketOwnerId" = $1 AND "currentStatus" IN ${ACTIVE}`, staff.id);
    await add(`${who}.awaitingReview`, s.metrics.awaitingReview.value, `FROM "Ticket" WHERE "requesterIndicatedResolved" AND "currentStatus" IN ${ACTIVE}`);
    await add(`${who}.highPriorityOpen`, s.metrics.highPriorityOpen.value, `FROM "Ticket" WHERE "itPriority" = 'HIGH' AND "currentStatus" IN ${ACTIVE}`);
    await add(`${who}.myOpenActions`, s.metrics.myOpenActions.value,
      `FROM "ActionTaken" WHERE "performedById" = $1 AND status IN ('PLANNED','IN_PROGRESS')`, staff.id);
    for (const st of STATUSES) await add(`${who}.byStatus.${st}`, s.byStatus[st], `FROM "Ticket" WHERE "currentStatus" = $1::"TicketStatus"`, st);
    for (const p of ["LOW", "MEDIUM", "HIGH"]) {
      await add(`${who}.byItPriority.${p}`, s.byItPriority[p], `FROM "Ticket" WHERE "itPriority" = $1::"Priority" AND "currentStatus" IN ${ACTIVE}`, p);
    }
    await add(`${who}.byItPriority.NONE`, s.byItPriority.NONE, `FROM "Ticket" WHERE "itPriority" IS NULL AND "currentStatus" IN ${ACTIVE}`);
    if (s.userAccounts) {
      const role = (rl: string) => [`FROM "User" WHERE "isActive" AND role = $1::"Role"`, rl] as const;
      await add(`${who}.userAccounts.activeRequesters`, s.userAccounts.activeRequesters, ...role("REQUESTER"));
      await add(`${who}.userAccounts.activeItStaff`, s.userAccounts.activeItStaff, ...role("IT_STAFF"));
      await add(`${who}.userAccounts.activeAdministrators`, s.userAccounts.activeAdministrators, ...role("ADMINISTRATOR"));
      await add(`${who}.userAccounts.inactive`, s.userAccounts.inactive, `FROM "User" WHERE NOT "isActive"`);
    } else {
      notes.push(`${who}: no userAccounts in the response (IT Staff, BR-27)`);
    }
  }

  console.log(`Lab 4 metrics check - ${new Date().toISOString()}`);
  console.log("metric | API | SQL | match");
  for (const [metric, api, sql] of rows) console.log(`${metric} | ${api} | ${sql} | ${api === sql ? "yes" : "NO"}`);
  const bad = rows.filter(([, api, sql]) => api !== sql).length;
  for (const note of notes) console.log(note);
  console.log(`${rows.length} metrics, ${bad} mismatch(es)`);
  process.exitCode = bad ? 1 : 0;
}

main()
  .catch((err) => {
    console.error("Metrics check failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
