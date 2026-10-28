# Lab 4 Sprint Engineering Specification — TokTickIT Actions Taken, Dashboards, and Final Regression

**Extends:** `docs/lab-03/specification.md` (and, through it, Labs 1–2). Everything in
the Lab 3 contract stays in force unless this document explicitly changes it; the
intentional changes are listed in §11 (CHG-01, CHG-02).

Companion documents: `docs/lab-04/api-spec.md` (exact endpoints and shapes),
`docs/lab-04/ui-spec.md` (screens and visual rules), `docs/lab-04/tests.md` (planned
tests and traceability).

---

## 1. Sprint Goal

Complete the TokTickIT service-desk workflow: IT Staff record the real work done on a
Ticket as **Actions Taken**, the backend refuses to resolve a Ticket until that work is
recorded and finished, every role starts from a concise **dashboard** that is computed
from authoritative data and drills down into the existing detailed screens, and the
whole application built in Labs 1–3 is hardened, regression-tested, and ready for the
final demonstration.

## 2. Stakeholder Request Interpretation

- The service desk needs to **plan and track the actual work** on each Ticket, not
  only talk about it. Each Ticket gets a list of Actions Taken (date/time, description,
  result, who performed it, follow-up needed and why, and a note about which file
  shows the evidence).
- The **Ticket Owner still coordinates** the Ticket, but several IT Staff members may
  perform and record actions on the same Ticket.
- A Requester can still say "the problem appears resolved", but that is only a
  signal: **IT Staff must review the recorded work** and formally resolve the Ticket.
- **Dashboards** give each role a short starting point (counts and short lists) that
  link to the detailed screens; they summarize, they do not replace the Queue or
  My Tickets.
- Finally, the product must **look and behave like one coherent Zen Green
  application** in which every Lab 1–3 feature still works.

## 3. Scope

### Included
- Actions Taken: list, create, view/edit, assign, status (planned → in progress →
  completed / cancelled), validation, append-only history, Requester read-only view.
- Final Ticket workflow: the Lab 3 transition matrix confirmed as final, a backend
  **resolution gate**, an append-only **Status History**, stale-update detection, and
  a visible "Requester says resolved — review needed" indication for IT Staff.
- Requester Dashboard, IT Staff Dashboard, Administrator Dashboard (IT Staff
  dashboard + user-account counts), each metric with a defined query, empty
  behavior, and drill-down.
- Drill-down support on My Tickets, Ticket Queue, and User Management (list filters
  initialised from URL query parameters).
- Prisma migration, backfill, idempotent seed, REST API increments.
- Final hardening: regression of Labs 1–3, consistent feedback states, duplicate
  submission prevention, data preservation after recoverable failures, console/link/
  placeholder clean-up, README update, health endpoint.

### Explicitly Excluded
- Automatic SLA clocks, escalation engines, on-call scheduling, breach notifications.
- Email, SMS, LINE, push, or any external notification service.
- Inventory, spare parts, purchasing, cost accounting, time-sheet billing, payroll,
  labour-cost calculation (Actions Taken record **no** duration, cost, or hours).
- Multi-level approval workflows and electronic signatures.
- BI tools, custom report builders, exports, charts beyond simple counts.
- Multi-tenant organizations and production-scale cloud operations.
- File upload on Actions Taken (Attachment Notes is a **text reference** to an
  existing Ticket attachment or an external file, see BR-07).
- Editing or deleting Public Comments, Internal Notes, Status History, or
  completed/cancelled Actions Taken.
- Any feature not listed in this contract.

## 4. Functional Requirements

### 4.1 Actions Taken
| ID | Requirement |
|----|-------------|
| FR-01 | IT Staff and Administrators can list every Action Taken of any Ticket in the Staff Ticket Detail, in stable chronological order (BR-19). |
| FR-02 | IT Staff and Administrators can create an Action Taken with Action Date/Time, Action Description, optional Result, Follow-Up Required, Follow-up Note, and Attachment Notes; **Created by** and the default **Performed by** are set automatically from the session. |
| FR-03 | IT Staff and Administrators can assign (re-assign) the **Performed by** of an open Action Taken to any active IT Staff or Administrator. |
| FR-04 | IT Staff and Administrators can view an Action Taken and edit its fields while it is open (Planned or In Progress). |
| FR-05 | IT Staff and Administrators can move an Action Taken through its own status: start (In Progress), complete (requires a Result), or cancel (requires a confirmation step). |
| FR-06 | A Requester sees every Action Taken of their own Tickets, read-only, in their Ticket Detail. |

### 4.2 Ticket Workflow
| ID | Requirement |
|----|-------------|
| FR-07 | Ticket status changes follow the final transition matrix (§5.1), enforced by the backend; the UI offers only the permitted targets for the current status. |
| FR-08 | A Ticket can be moved to Resolved only when the resolution gate (BR-12) is satisfied; otherwise the backend rejects the change with the list of blockers and the UI explains what is missing. |
| FR-09 | Every successful status change appends one Status History entry (from, to, by, when) that IT Staff and the owning Requester can read in Ticket Detail. |
| FR-10 | The Staff Ticket Detail shows the Requester's "Problem Appears Resolved" indication as a review prompt; it never changes the status by itself. |
| FR-11 | Concurrent or stale updates of a Ticket status or of an Action Taken are detected and rejected with a conflict message; the screen then reloads the current data so nobody overwrites another person's change unknowingly. |
| FR-12 | After a successful status change, the Ticket summary (status badge, resolved date, legal next statuses) refreshes without a manual reload. |

### 4.3 Dashboards
| ID | Requirement |
|----|-------------|
| FR-13 | Requester Dashboard shows, for the authenticated Requester only: Open, Waiting for You, Resolved (last 7 days), and Closed counts; a "Needs Your Attention" list; a "Recently Updated" list; quick actions (Create Ticket, View My Tickets). |
| FR-14 | IT Staff Dashboard shows: Unassigned, My Open Tickets, Awaiting Review, High Priority Open, and My Open Actions counts; counts by status and by IT Priority; lists "My Open Actions", "Urgent Tickets", and "Recently Updated". |
| FR-15 | Administrator Dashboard shows the IT Staff Dashboard plus a User Accounts card (active Requesters, active IT Staff, active Administrators, inactive accounts). |
| FR-16 | Every count card has a drill-down to the matching filtered list (My Tickets, Ticket Queue, or User Management) or to an on-page list; every list item opens its Ticket Detail. The destination list applies exactly the same filter as the metric. |
| FR-17 | After login, every role lands on its Dashboard; "Dashboard" is the first navigation item and shows active-page indication. |
| FR-18 | Each dashboard has a Refresh action and distinct loading, empty, forbidden, and safe-failure states. |

### 4.4 Final Regression and Hardening
| ID | Requirement |
|----|-------------|
| FR-19 | Every Lab 1–3 capability remains available to the permitted roles: login/logout/change password, My Tickets (search/filter/sort/paginate), Create Ticket, Ticket Detail, Attachments (add/download/remove), Public Comments, Problem Appears Resolved, Ticket Queue, Claim/Reassign, IT Priority, Internal Notes, User Management. |
| FR-20 | Loading, validation, success, empty/no-results, forbidden, conflict, not-found, and safe API-failure feedback are consistent across all screens (same components and wording style). |
| FR-21 | Repeated clicks and network retries cannot create duplicate Actions Taken or apply a status change twice (BR-17, BR-18). |
| FR-22 | The Action Taken form and the status change keep the entered values after a recoverable failure (network error, 409, 500). |
| FR-23 | No console errors, broken links, placeholder text, temporary or duplicate UI elements remain; README setup, migration, seed, test, and demo instructions are current. |
| FR-24 | `GET /api/health` stays exactly as in Lab 1 (`{ status: "ok", service: "TokTickIT API" }`); a new public `GET /api/health/db` reports the database status (`SELECT 1`) for the final demonstration. |

## 5. Business Rules

### 5.0 Actions Taken
| ID | Rule |
|----|------|
| BR-01 | An Action Taken belongs to exactly one Ticket; its `ticketId` is set at creation from the URL and can never change. |
| BR-02 | The Ticket Owner coordinates the Ticket, but an Action Taken may be performed by a different IT Staff member or Administrator; Performed by is independent of Ticket Owner. |
| BR-03 | Only IT Staff and Administrators create or update Actions Taken. A Requester can only read the Actions Taken of their own Tickets. Every write is enforced by the backend (Requester → `403 FORBIDDEN`; another Requester's Ticket → `404 NOT_FOUND`). |
| BR-04 | **Created by** is always the authenticated session user, set by the server, never accepted from the client, and immutable. |
| BR-05 | **Performed by** ("auto") defaults to the creator. It may be re-assigned only to an **active** user whose role is IT Staff or Administrator; any other value is rejected with `422 INVALID_ASSIGNEE` and nothing is saved. |
| BR-06 | **Action Date/Time** is required (the form pre-fills "now"); it must not be earlier than the Ticket's creation time (compared at minute precision, the resolution of the form's `datetime-local` value) nor later than the server time + 5 minutes; it is sent as ISO-8601 with a time zone. Stored in UTC, displayed in the viewer's local time zone. |
| BR-07 | Field rules (trimmed): Action Description required, 1–2000 characters. Result optional while the action is open, **required (1–2000) to complete it**. Follow-up Note **required (1–1000) when Follow-Up Required is true**, and stored as `null` when it is false. Attachment Notes optional, ≤ 500 characters, plain text describing which file to look at (e.g. an attachment file name); it is not an upload. |
| BR-08 | Action Taken status transitions: PLANNED → IN_PROGRESS, COMPLETED, CANCELLED; IN_PROGRESS → COMPLETED, CANCELLED; COMPLETED and CANCELLED are terminal. Anything else → `409 INVALID_ACTION_TRANSITION`. Completing sets `completedAt`; cancelling sets `cancelledAt`. |
| BR-09 | **Append-only:** Actions Taken are never deleted (no DELETE endpoint). A COMPLETED or CANCELLED Action Taken is immutable (`409 ACTION_LOCKED`); a correction is recorded as a new Action Taken. Public Comments, Internal Notes, and Status History entries are also append-only. |
| BR-10 | Actions Taken can be created or edited only while the Ticket is active (NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED); otherwise `409 TICKET_NOT_ACTIVE`. To work on a Resolved or Closed Ticket, IT Staff reopen it first. |

### 5.1 Ticket Status and Resolution
Final transition matrix — **identical to Lab 3 §4.7** (it already covered the complete
lifecycle; Lab 4 confirms it as final and adds the resolution gate):

| From \ To | OPEN | IN_PROGRESS | WAITING_FOR_REQUESTER | RESOLVED | CLOSED | REOPENED | CANCELLED |
|---|---|---|---|---|---|---|---|
| **NEW** | ✅ | ✅ | – | – | – | – | ✅ |
| **OPEN** | – | ✅ | – | – | – | – | ✅ |
| **IN_PROGRESS** | – | – | ✅ | ✅ (gate) | – | – | ✅ |
| **WAITING_FOR_REQUESTER** | – | ✅ | – | ✅ (gate) | – | – | ✅ |
| **RESOLVED** | – | – | – | – | ✅ | ✅ | – |
| **CLOSED** | – | – | – | – | – | ✅ | – |
| **REOPENED** | – | ✅ | ✅ | – | – | – | ✅ |
| **CANCELLED** | – | – | – | – | – | – | – (terminal) |

Authorized roles for every transition: IT Staff and Administrator. Requesters cannot
change the status (they can only set the advisory indication, BR-14).

| ID | Rule |
|----|------|
| BR-11 | Only the transitions in the matrix above are allowed (`409 INVALID_TRANSITION` otherwise), only for IT Staff and Administrators, enforced by the backend. |
| BR-12 | **Resolution gate.** A Ticket may enter RESOLVED only if (a) it has a Ticket Owner, (b) it has at least one COMPLETED Action Taken, and (c) it has no PLANNED or IN_PROGRESS Action Taken. (a) fails with the Lab 3 code `409 UNASSIGNED_TICKET`; (b)/(c) fail with `409 RESOLUTION_BLOCKED` and `blockers: ["NO_COMPLETED_ACTION", "OPEN_ACTIONS"]` (those that apply). The check runs inside the status endpoint, so a client that bypasses the screen gets the same result. |
| BR-13 | CLOSED is reachable only from RESOLVED, so every closed Ticket has passed the gate. CANCELLED does not require any Action Taken and needs a UI confirmation step. |
| BR-14 | A Requester's "Problem Appears Resolved" indication is advisory: it sets `requesterIndicatedResolved = true`, never changes `currentStatus`, appears to IT Staff as "Awaiting review", and is cleared when the Ticket is REOPENED. |
| BR-15 | Entering RESOLVED sets `resolvedAt = now()`; entering REOPENED clears `resolvedAt`; CLOSED keeps it. |
| BR-16 | Every successful status change writes exactly one `TicketStatusChange` row (from, to, changed by, changed at) in the **same database transaction** as the status update. These rows are never updated or deleted. |
| BR-17 | **Stale updates.** Every Action Taken update must send `expectedUpdatedAt`; if the stored `updatedAt` differs, the update is rejected with `409 STALE_UPDATE` and the current record. The Ticket status endpoint accepts `expectedUpdatedAt` (always sent by the Lab 4 UI; optional in the API for Lab 3 compatibility) with the same behavior, and performs a conditional update on the status it read, so two simultaneous transitions can never both succeed. |
| BR-18 | **Idempotent creation.** Creating an Action Taken accepts a client-generated `clientRequestId` (UUID). A repeated request with the same Ticket and `clientRequestId` returns the original Action Taken (`200`) instead of creating a duplicate. |
| BR-19 | **Stable ordering.** Actions Taken: `actionAt` ascending, then `id` ascending. Status History: `changedAt` ascending, then `id`. Public Comments and Internal Notes: `createdAt` ascending, then `id`. The same data always renders in the same order. |
| BR-20 | **Visibility.** IT Staff and Administrators see everything on every Ticket. A Requester sees, on their own Tickets only: ticket fields, Attachments, Public Comments, Actions Taken, and Status History — never Internal Notes (Lab 3 BR-08/BR-27 unchanged). |

### 5.2 Dashboards
| ID | Rule |
|----|------|
| BR-21 | Every metric is calculated by the backend from the database at request time (Prisma `count`/`groupBy`/`findMany`); the client never counts records and no counter is stored. |
| BR-22 | **Active statuses** = NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED. **Open Actions** = Actions Taken in PLANNED or IN_PROGRESS. |
| BR-23 | **Recent window** = the rolling 7 × 24 hours before the server time `now()` (UTC). There is no calendar-day boundary, so the result does not depend on a time zone. Every dashboard list is capped at 5 items. |
| BR-24 | The Requester dashboard is scoped to `requesterId = session user`; any requester id sent by the client is ignored (Lab 3 BR-07). |
| BR-25 | **Empty behavior.** A metric with no matching records returns `0`; a list returns `[]`. The UI shows a friendly empty message for that card/list; an empty result is never an error. |
| BR-26 | **Drill-down equality.** Every count card links to a list whose query applies exactly the same filter (§7 of `api-spec.md`), so the card value equals the destination's `totalItems`. |
| BR-27 | The Administrator receives the IT Staff dashboard plus `userAccounts`; an IT Staff response never contains `userAccounts`. A Requester calling the staff dashboard gets `403`. |
| BR-28 | After login (and on `/`), every role is routed to `/dashboard`, which renders the dashboard of the user's role. Deep links keep working. |

#### Metric definitions (all counts over `Ticket` unless stated)
| Metric (API key) | Dashboard | Calculation | Drill-down |
|---|---|---|---|
| `openTickets` | Requester | requesterId = me AND currentStatus ∈ active | `/tickets?status=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED` |
| `waitingForMe` | Requester | requesterId = me AND currentStatus = WAITING_FOR_REQUESTER | `/tickets?status=WAITING_FOR_REQUESTER` |
| `resolvedLast7Days` | Requester | requesterId = me AND currentStatus ∈ {RESOLVED, CLOSED} AND resolvedAt ≥ now − 7 d | `/tickets?status=RESOLVED,CLOSED&resolvedWithinDays=7` |
| `closedTickets` | Requester | requesterId = me AND currentStatus = CLOSED | `/tickets?status=CLOSED` |
| `attentionTickets` (list) | Requester | requesterId = me AND currentStatus = WAITING_FOR_REQUESTER, oldest `updatedAt` first, max 5 | `/tickets/:ticketNumber` |
| `recentTickets` (list) | Requester | requesterId = me, `updatedAt` desc then ticketNumber desc, max 5 | `/tickets/:ticketNumber` |
| `unassignedOpen` | Staff | ticketOwnerId IS NULL AND currentStatus ∈ active | `/staff/tickets?ownership=unassigned&status=<active>` |
| `myOpenTickets` | Staff | ticketOwnerId = me AND currentStatus ∈ active | `/staff/tickets?ownership=mine&status=<active>` |
| `awaitingReview` | Staff | requesterIndicatedResolved = true AND currentStatus ∈ active | `/staff/tickets?requesterResolved=true&status=<active>` |
| `highPriorityOpen` | Staff | itPriority = HIGH AND currentStatus ∈ active | `/staff/tickets?priority=HIGH&status=<active>` |
| `myOpenActions` | Staff | **ActionTaken** performedById = me AND status ∈ {PLANNED, IN_PROGRESS} | on-page list `#my-open-actions` |
| `byStatus.<STATUS>` | Staff | currentStatus = STATUS (all 8 statuses, zeros included) | `/staff/tickets?status=<STATUS>` |
| `byItPriority.<LOW\|MEDIUM\|HIGH\|NONE>` | Staff | currentStatus ∈ active AND itPriority = value (NONE = IS NULL) | `/staff/tickets?priority=<value>&status=<active>` |
| `myOpenActionsList` (list) | Staff | same filter as `myOpenActions`, oldest `actionAt` first, max 5, with ticketNumber | `/staff/tickets/:ticketNumber` |
| `urgentTickets` (list) | Staff | currentStatus ∈ active AND itPriority = HIGH, oldest `createdAt` first, max 5 | `/staff/tickets/:ticketNumber` |
| `recentTickets` (list) | Staff | all Tickets, `updatedAt` desc then ticketNumber desc, max 5 | `/staff/tickets/:ticketNumber` |
| `userAccounts` | Admin only | User counts: active ∧ role = REQUESTER / IT_STAFF / ADMINISTRATOR; `inactive` = isActive = false | `/admin/users?role=<ROLE>&isActive=true`; `inactive` → `/admin/users?isActive=false` |

## 6. UI Specification Summary

Full details in `docs/lab-04/ui-spec.md`. Summary:
- **Navigation:** Dashboard becomes the first item for every role (Requester:
  Dashboard, My Tickets, Create Ticket; IT Staff: Dashboard, Ticket Queue;
  Administrator: Dashboard, Ticket Queue, Users) with active-page indication.
- **Dashboards:** greeting + Refresh, a row of metric cards (label, value,
  "View all" link with an accessible name), lists with ticket number, summary, status
  badge, and date; Requester quick actions. Cards wrap 4 → 2 → 1 columns.
- **Actions Taken (Staff Ticket Detail):** new section between the Operational Panel
  and Public Comments: table on desktop (≥ 992 px), cards below 992 px; "Add Action" opens a
  create panel; each row has a View/Edit panel (edit only while open), Start,
  Complete (asks for the Result), Cancel (confirmation dialog), and an Assign select.
- **Ticket workflow:** the status select lists only legal targets; when the
  resolution gate is not met, "Resolved" is shown disabled with the reason, and a
  server rejection lists the blockers. A Status History timeline is shown on staff
  and Requester Ticket Detail. A "Requester says resolved — review needed" banner
  appears on staff Ticket Detail when applicable.
- **Requester Ticket Detail:** read-only Actions Taken list and Status History.
- **Shared:** Zen Green tokens/badges from Labs 2–3 reused; new Action status badges
  (Planned, In Progress, Completed, Cancelled) and a Follow-up badge; every state
  (loading, empty, no-results, forbidden, conflict, not-found, failure) uses the
  existing components. Success feedback is an inline `zg-callout-info` with
  `role="status"` (no toast component); a forbidden route redirects to the role's
  dashboard, as in Lab 3, without a toast.

## 7. Data Changes

```prisma
enum ActionStatus {
  PLANNED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

model ActionTaken {
  id               Int          @id @default(autoincrement())
  ticketId         Int
  ticket           Ticket       @relation(fields: [ticketId], references: [id])
  actionAt         DateTime                     // Action Date/Time (BR-06)
  description      String                       // 1–2000
  result           String?                      // required to complete (BR-07)
  status           ActionStatus @default(PLANNED)
  performedById    Int                          // "Performed by" (auto = creator, re-assignable, BR-05)
  performedBy      User         @relation("ActionPerformedBy", fields: [performedById], references: [id])
  createdById      Int                          // "Created by" (session, immutable, BR-04)
  createdBy        User         @relation("ActionCreatedBy", fields: [createdById], references: [id])
  followUpRequired Boolean      @default(false)
  followUpNote     String?                      // required iff followUpRequired
  attachmentNotes  String?                      // ≤ 500, text reference
  clientRequestId  String?                      // idempotency key (BR-18)
  completedAt      DateTime?
  cancelledAt      DateTime?
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  @@unique([ticketId, clientRequestId])
  @@index([ticketId, actionAt, id])
  @@index([performedById, status])
}

model TicketStatusChange {
  id          Int          @id @default(autoincrement())
  ticketId    Int
  ticket      Ticket       @relation(fields: [ticketId], references: [id])
  fromStatus  TicketStatus
  toStatus    TicketStatus
  changedById Int
  changedBy   User         @relation(fields: [changedById], references: [id])
  changedAt   DateTime     @default(now())

  @@index([ticketId, changedAt, id])
}

// Ticket (additions)
//   resolvedAt     DateTime?
//   actionsTaken   ActionTaken[]
//   statusChanges  TicketStatusChange[]
//   @@index([currentStatus, ticketOwnerId])
//   @@index([requesterId, currentStatus])
// User (additions)
//   actionsPerformed ActionTaken[]        @relation("ActionPerformedBy")
//   actionsCreated   ActionTaken[]        @relation("ActionCreatedBy")
//   statusChanges    TicketStatusChange[]
```

**Database-design decisions (justified):**
1. **Actions Taken are their own child table with two user foreign keys**
   (`createdById`, `performedById`) instead of columns on `Ticket` or a JSON array.
   One Ticket has many Actions Taken (§5.1 of the handout), each needs its own
   status, timestamps, concurrency token (`updatedAt`) and validation; two named
   relations keep "who recorded it" (audit, immutable) separate from "who does it"
   (re-assignable), which is exactly the Ticket Owner vs. performer split of BR-02.
2. **Status history is an append-only table** (`TicketStatusChange`) written in the
   same transaction as the status update, instead of overwriting `currentStatus`
   only. It gives a stable, auditable timeline (BR-16, BR-19) without changing the
   Lab 3 `Ticket` semantics.
3. **`resolvedAt` is stored on `Ticket`** although it could be derived from the
   history: legacy Tickets have no history rows (§7.1), so a column is the only way
   to give "Resolved in the last 7 days" a correct, indexable answer for old and new
   data alike.
4. **Idempotency key `@@unique([ticketId, clientRequestId])`**: duplicate clicks or
   network retries are rejected by the database itself, not only by a disabled
   button (BR-18).
5. **Indexes** `[ticketId, actionAt, id]` (ordered list per Ticket),
   `[performedById, status]` (My Open Actions), `[currentStatus, ticketOwnerId]` and
   `[requesterId, currentStatus]` (dashboard counts).
6. **Enum** `ActionStatus` rather than a reference table: the four values are fixed
   by the workflow and checked by the transition function (BR-08).

### 7.1 Migration, Backfill, and Recovery
Migration `prisma/migrations/20261028000001_lab4_actions_taken/` is **additive only**:
1. Create enum `ActionStatus`, tables `ActionTaken` and `TicketStatusChange`,
   column `Ticket.resolvedAt` (nullable), and the new indexes.
2. **Backfill:** `UPDATE "Ticket" SET "resolvedAt" = "updatedAt" WHERE "currentStatus"
   IN ('RESOLVED','CLOSED') AND "resolvedAt" IS NULL;` (best available evidence of
   the resolution time for legacy rows).
3. **Legacy Tickets** keep their status and all data; they have zero Actions Taken
   and no Status History (the timeline shows "History recorded from Lab 4 onwards").
   The resolution gate applies only to **new** transitions into RESOLVED, so a legacy
   Resolved/Closed Ticket stays valid; reopening it and resolving it again requires
   recorded work.
4. **Dashboards and legacy data:** legacy Tickets are counted like any other Ticket;
   `myOpenActions` simply ignores them (no actions).
5. **Rollback/recovery:** before migrating, `pg_dump` the database (README command).
   Because the migration only adds objects, recovery is
   `scripts/lab4-rollback.sql` (drops the two tables, the enum, the column, and the
   indexes, then deletes the migration row), or a restore of the dump.
6. **Tested:** `server/tests/lab-04/migration.api.test.ts` checks that every Lab 1–3
   row count and a sample of field values are unchanged after migration, legacy
   Tickets have no actions, and `resolvedAt` is backfilled (MIG-01…MIG-04).

### 7.2 Seed Data (idempotent)
The existing seed is extended; every new row uses a stable key so re-running the seed
changes nothing (Actions Taken use `clientRequestId = "seed-<ticketNumber>-<n>"`
with upsert on `[ticketId, clientRequestId]`).
- Tickets covering all 8 statuses, all IT Priorities including "not set", assigned and
  unassigned ownership.
- Tickets with **zero**, **one**, and **multiple** (≥ 3) Actions Taken, including
  each Action status, follow-up required with a note, and attachment notes.
- At least one Resolved Ticket with `resolvedAt` inside the last 7 days and one
  outside it; Waiting-for-Requester Tickets for a seeded Requester; one Ticket with
  `requesterIndicatedResolved = true` in an active status.
- Non-zero and zero metrics: one seeded Requester has no Ticket at all, and one IT
  Staff member has no open Action (both dashboards render their empty states).
- Status History rows for the seeded workflow transitions.
- Credentials stay local-development-only (README).

## 8. API Contract

Exact shapes in `docs/lab-04/api-spec.md`. New or changed endpoints:

| Method & Path | Purpose | Roles |
|---|---|---|
| `GET /api/staff/tickets/:ticketNumber` | (changed) also returns `actionsTaken`, `statusHistory`, `resolvedAt`, `resolutionGate`, `legalNextStatuses` | IT Staff, Admin |
| `GET /api/tickets/:ticketNumber` | (changed) also returns read-only `actionsTaken`, `statusHistory`, `resolvedAt` | Requester (owner) |
| `GET /api/staff/tickets/:ticketNumber/actions` | List Actions Taken | IT Staff, Admin |
| `POST /api/staff/tickets/:ticketNumber/actions` | Create an Action Taken (idempotent) | IT Staff, Admin |
| `PATCH /api/staff/tickets/:ticketNumber/actions/:actionId` | Edit / assign an open Action Taken | IT Staff, Admin |
| `PATCH /api/staff/tickets/:ticketNumber/actions/:actionId/status` | Start / complete / cancel | IT Staff, Admin |
| `PATCH /api/staff/tickets/:ticketNumber/status` | (changed) resolution gate, stale check, history, `resolvedAt` | IT Staff, Admin |
| `GET /api/staff/tickets`, `GET /api/tickets` | (changed, additive) comma-separated `status`, plus drill-down filters | as Lab 3 |
| `GET /api/admin/users` | (changed, additive) `isActive` filter; existing `role` filter used by drill-down | Admin |
| `GET /api/dashboard/requester` | Requester dashboard | Requester |
| `GET /api/dashboard/staff` | IT Staff dashboard (+ `userAccounts` for Admin) | IT Staff, Admin |
| `GET /api/health` | (unchanged from Lab 1) `{ status, service }` | Public |
| `GET /api/health/db` | (new) database status: `200 { database: "ok" }` / `503 { database: "unreachable" }` | Public |

New error codes: `409 RESOLUTION_BLOCKED`, `409 STALE_UPDATE`,
`409 INVALID_ACTION_TRANSITION`, `409 ACTION_LOCKED`, `409 TICKET_NOT_ACTIVE`,
`422 INVALID_ASSIGNEE`. Error shape unchanged: `{ error, message, fields? }`.
There is **no** DELETE endpoint for Actions Taken, Status History, Comments, or Notes.

## 9. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-01 | Given a permitted IT Staff user and valid data, when an Action Taken is created, then it is saved under the correct Ticket with the authenticated creator as Created by and the approved assignee (default: the creator) as Performed by. |
| AC-02 | Given an authenticated Requester, when dashboard data is retrieved, then only metrics and recent Tickets owned by that Requester are returned. |
| AC-03 | Given an Action Taken being created or assigned to an inactive user or to a Requester, when it is submitted, then it is rejected with `422 INVALID_ASSIGNEE` and nothing is saved. |
| AC-04 | Given Follow-Up Required is checked and the Follow-up Note is empty, when the action is saved, then it is rejected with a field-level validation error and nothing is saved. |
| AC-05 | Given a Requester session, when any Action Taken create/update/status endpoint is called directly, then it is rejected with `403`; the Requester sees the Actions Taken of their own Ticket read-only and gets `404` for another Requester's Ticket. |
| AC-06 | Given an open Action Taken, when it is completed without a Result, then it is rejected; with a Result it becomes COMPLETED with `completedAt`, and any later edit is rejected with `409 ACTION_LOCKED`. |
| AC-07 | Given an open Action Taken, when it is cancelled after confirmation, then it becomes CANCELLED, stays visible in the list, and cannot be edited. |
| AC-08 | Given a Ticket with no COMPLETED Action Taken or with an open Action Taken, when a transition to RESOLVED is requested (including directly through the API), then it is rejected with `409 RESOLUTION_BLOCKED` listing the blockers and the status is unchanged. |
| AC-09 | Given an owned Ticket with at least one COMPLETED and no open Action Taken, when IT Staff resolve it, then the status becomes RESOLVED, `resolvedAt` is set, one Status History entry is appended, and the Ticket summary refreshes. |
| AC-10 | Given any status pair not in the final matrix, when the transition is requested, then it is rejected with `409 INVALID_TRANSITION` and the status is unchanged. |
| AC-11 | Given two IT Staff users editing the same Action Taken, when the second saves with a stale `expectedUpdatedAt`, then it is rejected with `409 STALE_UPDATE` and the first user's change is kept. |
| AC-12 | Given a Ticket whose status was changed by another user, when a stale status change is submitted, then it is rejected with `409 STALE_UPDATE` and nothing is overwritten. |
| AC-13 | Given the same create request is sent twice with the same `clientRequestId`, when both are processed, then exactly one Action Taken exists. |
| AC-14 | Given a Requester marks "Problem Appears Resolved", when IT Staff open the Ticket and their dashboard, then the status is unchanged, the Ticket shows "Awaiting review", and it is counted in `awaitingReview`. |
| AC-15 | Given a Ticket with several Actions Taken and status changes, when it is reloaded, then items appear in the same chronological order every time, and no endpoint can delete them. |
| AC-16 | Given the seeded database, when the IT Staff and Requester dashboards are retrieved, then every metric equals the result of the equivalent SQL query run directly on the database. |
| AC-17 | Given a dashboard count card, when its drill-down is opened, then the destination list shows a `totalItems` equal to the card value. |
| AC-18 | Given a Requester with no Tickets or a staff member with no open actions, when the dashboard loads, then zero values and empty lists are shown with empty-state messages, not errors. |
| AC-19 | Given a Requester calling the staff dashboard, then `403`; given no session, then `401`; given IT Staff, the response has no `userAccounts`; given an Administrator, it includes `userAccounts`. |
| AC-20 | Given a Lab 3 database, when the Lab 4 migration runs, then every earlier User, Ticket, Attachment, Comment, and Note is preserved unchanged, legacy Tickets have zero Actions Taken, and `resolvedAt` is backfilled for Resolved/Closed Tickets. |
| AC-21 | Given the final `main` branch, when the complete Lab 1–4 automated suites run, then all pass, with only the intentional contract changes CHG-01 and CHG-02 reflected in earlier tests. |
| AC-22 | Given 320, 768, and 1280 px viewports, when the dashboards and the Actions Taken area are displayed, then there is no horizontal page scroll, no clipped or overlapping control, and the Actions Taken table becomes cards below 992 px. |
| AC-23 | Given any role, when login succeeds, then the user lands on `/dashboard` showing that role's dashboard. |
| AC-24 | Given an API failure while loading a dashboard or saving an Action Taken, when it occurs, then a safe message with Retry is shown and the entered form values are preserved. |
| AC-25 | Given the seeded database, when each dashboard endpoint is called 10 times, then the 95th-percentile response time is under 500 ms (performance smoke). |

## 10. Definition of Done

**Product completion (all must be true before the coding agent may report "done"):**
- [ ] FR-01…FR-24 implemented and manually verified on the running app.
- [ ] Every AC-01…AC-25 has at least one passing automated test whose name starts with its test ID, at the file path listed in `tests.md`.
- [ ] BR-01…BR-28 enforced by the backend (not only by the UI); the transition matrix and resolution gate are enforced in the status endpoint.
- [ ] `npm run test` (server + client) and `npm run test:e2e` pass on the final `main` with **zero** failing, skipped, `.only`, or `.skip` tests, Labs 1–4 included.
- [ ] Migration applied on a copy of the Lab 3 database and on a fresh database (`migrate deploy` + `db:seed` twice) without error; the seed is idempotent.
- [ ] Dashboard metrics verified against direct SQL (`scripts/lab4-metrics-check.ts` output saved).
- [ ] Dashboards, Actions Taken, workflow, and every Lab 1–3 screen visually match `ui-spec.md` at 320, 768, and 1280 px (screenshots in `artifacts/lab-04/screenshots/`), with no console error.
- [ ] No temporary/duplicate/placeholder UI, broken link, or obsolete control remains.
- [ ] No secret or plaintext password committed; `.env` files ignored.
- [ ] README setup, migration, rollback, seed, test, and demo instructions verified from a clean clone.

**Course delivery (checked separately):** GitHub Issues for the sprint on the Kanban
(all Done), feature branches → peer-reviewed PRs into `lab4-staging` → one release PR
into `main`, `reviewer.md` and `ai-use.md` completed, submission PDF Answer Part 1–9.

## 11. Assumptions and Decisions

1. **Action status and assignee.** The handout's field list has no status or
   assignee, but its required evidence asks to "assign", "complete", "cancel", and
   reject an "inactive assignee", and AC-01 mentions an "approved assignee". We add a
   four-value Action status and treat **Performed by** as the assignee: it is
   filled automatically with the creator ("auto") and may be re-assigned to another
   active IT Staff/Administrator. The immutable **Created by** keeps the audit trail.
2. **Resolution gate** = owner + at least one completed action + no open action
   (BR-12). It turns "IT Staff must review the work" into a rule the backend can
   check. Cancelling a Ticket needs no action (e.g. duplicates).
3. **Transition matrix unchanged from Lab 3**: it already covered the complete
   lifecycle and is regression-tested; Lab 4 adds the gate instead of new edges.
4. **Requesters see Actions Taken** (handout §8.3 "Requesters will see all Actions
   Taken items"), including Result and Follow-up Note, which are written for the
   customer; private staff discussion stays in Internal Notes.
5. **"Recent" = rolling 7 days in UTC** to avoid time-zone ambiguity (BR-23).
6. **Stale-update token = `updatedAt`** (already used by Lab 3 claim/reassign)
   rather than a new `version` column; required for Actions Taken, optional on the
   Lab 3 status endpoint to keep its contract backward compatible.
7. **Intentional contract changes (affecting earlier tests):**
   - **CHG-01** — the post-login landing route becomes `/dashboard` for every role
     (was My Tickets / Ticket Queue / User Management). An earlier (Lab 2–3) E2E
     test may **either** update its post-login landing-URL assertion **or** add
     exactly one navigation step right after login (`page.goto` or a nav click) to
     reach the screen it tests. No other change to earlier tests is allowed.
   - **CHG-02** — the resolution gate means a Ticket cannot be resolved without
     recorded work. Lab 3 tests that resolve a Ticket now first create one COMPLETED
     Action Taken in their fixture; their assertions are unchanged.
8. **Administrator dashboard** reuses the IT Staff dashboard plus account counts,
   as allowed by the handout, instead of a third design.
