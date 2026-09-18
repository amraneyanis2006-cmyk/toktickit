# Lab 3 Sprint Engineering Specification — TokTickIT Authentication, Roles, IT Staff Ticketing, and Admin User Management

**Course:** CPE 334 — Introduction to Software Engineering in the Age of AI Agents
**Sprint:** Lab 3 — Users, Roles, IT Staff Ticketing, and Administrator Screens
**Stack:** React 19 + Vite + TypeScript + Bootstrap 5 (client) · Node.js + Express 5 + TypeScript (server) · Prisma 7 + PostgreSQL (data) · Vitest + Supertest + Testing Library + Playwright (tests)
**Extends:** `docs/lab-02/specification.md`, `docs/lab-02/api-spec.md`, `docs/lab-02/ui-spec.md`

---

## 1. Sprint Goal

Replace the temporary Development Requester selector with real, secure authentication
and server-enforced, role-based authorization for three roles — Requester, IT Staff,
and Administrator — while preserving every Lab 2 Requester capability. Deliver the
first operational IT Staff workflow (a searchable/filterable/sortable/paginated Ticket
Queue, Ticket Detail with claim/reassign, IT Priority, status transitions, Public
Comments, and Internal Notes) and a minimalist Administrator User Management screen,
all rendered in the existing Zen Green design language.

## 2. Stakeholder Request Interpretation

The Development Requester selector was a Lab 2 testing convenience and must be retired.
Every user now signs in with an email and password. A user issued an initial password
must choose a new one before reaching the application. Requesters keep using the Lab 2
ticket functions, but their identity now comes from their authenticated session instead
of a client-supplied header. IT Staff need a real queue to find and work tickets: claim
or reassign ownership, set IT Priority, move a ticket through its permitted statuses,
talk to the Requester through Public Comments, and keep private Internal Notes.
Requesters may flag that their problem appears resolved, but only IT Staff or an
Administrator can formally resolve or close a ticket. Administrators need a simple
screen to create accounts, edit basic account information, assign one role, activate or
deactivate accounts, and reset a user to a new initial password. Every protected
operation must be enforced on the backend — a hidden button is a UI convenience, not a
security control.

## 3. Scope

### Included
- Login screen (email + password) and Logout action
- Mandatory Change Password flow for users with an initial/reset password
- Authenticated application shell: current user name + role, role-specific navigation
- Migration of Requester identity from `x-requester-id` header to session-derived
  authenticated identity, with the Development Requester selector fully removed
- Continued Requester ticketing (Lab 2 FR-04…FR-15), now scoped to the authenticated
  Requester, plus Public Comments and a "Problem Appears Resolved" action
- IT Staff Ticket Queue: search, filter, sort, pagination, ownership/status visibility
- IT Staff Ticket Detail: claim/reassign ownership, set IT Priority, permitted status
  transitions, Public Comments, Internal Notes, existing Attachments
- Minimalist Administrator User Management: list, search, optional role filter, create,
  edit, activate/deactivate, reset to new initial password
- Server-side role-based authorization and ownership checks on every protected endpoint
- Automated tests: unit, API/integration, UI component, responsive/visual,
  security/authorization, migration/regression, and end-to-end

### Explicitly Excluded
- Email invitations, password-reset email, multi-factor authentication, social login,
  single sign-on, and self-registration
- Actions Taken (deferred to Lab 4); Actions-Taken-blocks-Resolved rule is deferred
- Formal SLA calculation, escalation rules, and notification services
- Dashboards and KPI analytics beyond simple queue counts
- Multi-tenant organizations, departments, and customer administration
- Production-grade deployment or cloud infrastructure changes
- Multiple roles per user; user deletion, bulk user operations, import/export, and
  account-history screens
- Department, organization, profile-photo, and other extended user-profile fields
- Account unlocking, administrator-approval workflows, and advanced identity management
- Mandatory pagination, multi-column sorting, or multiple simultaneous filters on the
  Administrator user list

## 4. Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-01 | The system shall let a user authenticate with an email address and password. |
| FR-02 | The system shall reject authentication for an inactive account with a safe, generic message that does not reveal whether the account exists. |
| FR-03 | The system shall force a user flagged as requiring a password change into a mandatory Change Password screen before any other screen is reachable. |
| FR-04 | The system shall let an authenticated user log out, invalidating their session. |
| FR-05 | The system shall let an authenticated user retrieve their own current identity (id, name, email, role, must-change-password flag). |
| FR-06 | The system shall derive the acting Requester identity solely from the authenticated session for every Lab 2 Requester Ticket/Attachment endpoint; the `x-requester-id` header is removed. |
| FR-07 | The system shall let an authenticated Requester continue to create, list, search, filter, sort, and paginate only their own Tickets, per Lab 2 FR-04…FR-14. |
| FR-08 | The system shall let an authenticated Requester post a Public Comment on a Ticket they own. |
| FR-09 | The system shall let an authenticated Requester mark a Ticket as "Problem Appears Resolved" without changing its formal Current Status. |
| FR-10 | The system shall let IT Staff retrieve a Ticket Queue across all Requesters, with search, filter, sort, and pagination. |
| FR-11 | The system shall let IT Staff or Administrator open Ticket Detail for any Ticket regardless of owner. |
| FR-12 | The system shall let IT Staff or Administrator claim an unassigned Ticket or reassign an already-assigned Ticket to any active IT Staff or Administrator user. |
| FR-13 | The system shall let IT Staff or Administrator set or change IT Priority on a Ticket. |
| FR-14 | The system shall let IT Staff or Administrator change Current Status to a value permitted by the status transition matrix (§4.7). |
| FR-15 | The system shall let IT Staff or Administrator post a Public Comment on any Ticket. |
| FR-16 | The system shall let IT Staff or Administrator create an Internal Note on any Ticket, visible only to IT Staff and Administrator. |
| FR-17 | The system shall let an Administrator retrieve a list of users, searchable by name or email, optionally filtered by role. |
| FR-18 | The system shall let an Administrator create a user with a name, email, one role, activation state, and a system-issued initial password. |
| FR-19 | The system shall let an Administrator edit a user's name, email, role, and activation state. |
| FR-20 | The system shall let an Administrator set a new initial password for a user, flagging that user's account to require a password change at next login. |
| FR-21 | The system shall prevent an Administrator from deactivating their own account. |
| FR-22 | The system shall prevent any action that would leave zero active Administrator accounts. |
| FR-23 | The system shall present loading, empty, no-results, validation-error, forbidden, not-found, conflict, and safe API-failure states on every new or changed screen. |
| FR-24 | The system shall render all new and changed screens responsively at desktop, tablet, and mobile breakpoints. |

## 5. Business Rules

| ID | Rule |
|----|------|
| BR-01 | Only an active user supplying a correct email/password pair may authenticate; all other combinations return the same generic invalid-credentials error (BR-02). |
| BR-02 | The login failure message for "no such email," "wrong password," and "inactive account" is identical ("Invalid email or password.") to avoid account enumeration; account-inactive detail is only ever logged server-side, never returned to the client. |
| BR-03 | A user with `mustChangePassword = true` cannot reach any screen other than Change Password until a new password is saved; the server rejects any other authenticated request from that session with `403 PASSWORD_CHANGE_REQUIRED` (except logout and current-user). |
| BR-04 | Passwords are never stored or logged in plaintext; only a salted hash (bcrypt, cost 12) is persisted. |
| BR-05 | A new password must be at least 8 characters and must differ from the current password; the Change Password form requires matching confirmation. |
| BR-06 | Sessions are invalidated on logout and expire automatically after 8 hours of inactivity. |
| BR-07 | The authenticated user identity (from the session), never a client-supplied id, determines ownership for every Requester operation — mirrors and replaces Lab 2 BR-03/BR-28. |
| BR-08 | Public Comments are readable by the Ticket's Requester, and by any IT Staff or Administrator; Internal Notes are readable only by IT Staff and Administrator. |
| BR-09 | A Requester may set `requesterIndicatedResolved = true` on their own Ticket; this never changes `currentStatus`, and is cleared automatically if the Ticket is Reopened. |
| BR-10 | Only IT Staff or Administrator may change `currentStatus`, `itPriority`, or ticket ownership; a Requester's own request to change any of these fields is rejected server-side, regardless of UI state. |
| BR-11 | A Ticket's Ticket Owner, when set, must reference an active User whose role is IT Staff or Administrator. |
| BR-12 | Claiming an unassigned Ticket sets the acting user as Ticket Owner; reassigning an already-owned Ticket requires the acting user to select an active IT Staff or Administrator user as the new owner. |
| BR-13 | Requested Priority is immutable after Ticket creation (owned by the Requester at submission time). IT Priority initially equals Requested Priority and may thereafter be changed only by IT Staff or Administrator. |
| BR-14 | Current Status transitions are restricted to the pairs listed in the status transition matrix (§4.7); an unlisted transition is rejected with `409 INVALID_TRANSITION`. |
| BR-15 | Public Comment and Internal Note content is required, trimmed, rejected if empty/whitespace-only, and limited to 2000 characters; both are append-only (no edit or delete) in Lab 3. |
| BR-16 | Each Public Comment and Internal Note records its author (from the session) and a server-generated timestamp; these fields are never client-supplied. |
| BR-17 | The IT Staff Ticket Queue returns Tickets across all Requesters; no ownership filtering is applied to IT Staff/Administrator queries (only role-based access applies). |
| BR-18 | Ticket Queue search matches Ticket Number or Summary, case-insensitive, partial match (mirrors Lab 2 BR-09); default sort is Created Date descending with Ticket Number descending as tiebreaker (mirrors Lab 2 BR-11); pagination defaults and fallbacks mirror Lab 2 BR-12. |
| BR-19 | An email address is unique across all users regardless of role; creating or editing a user with a duplicate email is rejected with `409 DUPLICATE_EMAIL`. |
| BR-20 | Each user has exactly one role at a time, one of `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR`; changing a user's role takes effect immediately for their next request (existing sessions are re-checked, not grandfathered). |
| BR-21 | Deactivating a user does not delete or reassign their data; an inactive user cannot authenticate (BR-01) but their historical Tickets, Comments, Notes, and ownership remain intact and visible to authorized roles. |
| BR-22 | An Administrator cannot deactivate their own account (`403 SELF_DEACTIVATION_FORBIDDEN`), and cannot deactivate or change the role of the last remaining active Administrator (`409 LAST_ADMIN_PROTECTED`); both checks are enforced server-side even if the request comes from a different Administrator. |
| BR-23 | Creating a user or resetting a password issues a system-generated initial password (not chosen by the Administrator or emailed) and sets `mustChangePassword = true` on that account. |
| BR-24 | All Lab 2 data (Categories, Related Systems, Tickets, Attachments) is preserved through migration; every existing Ticket's Requester is resolved to the corresponding migrated User row with no loss of ownership. |
| BR-25 | Every existing Lab 2 `RequesterUser` row is migrated into the unified `User` model with role `REQUESTER`, an assigned system-generated initial password, and `mustChangePassword = true`; no plaintext password is ever committed to the repository or seed script output logs. |
| BR-26 | Requesting a Ticket, Comment, or Note that exists but that the caller is not authorized to view returns `404 NOT_FOUND` (Requester case) or `403 FORBIDDEN` (role case, e.g., Requester calling an Internal Note endpoint) — never a response that discloses the protected content. |
| BR-27 | An Internal Note requested by a Requester is rejected before any note content is read from the database or included in the response. |
| BR-28 | While a Login, Change Password, Claim/Reassign, Status Change, Comment, Note, or Admin Create/Edit request is in flight, the corresponding submit control is disabled to prevent duplicate submissions (mirrors Lab 2 BR-13). |

## 4.7 Ticket Status Transition Matrix

| From \ To | OPEN | IN_PROGRESS | WAITING_FOR_REQUESTER | RESOLVED | CLOSED | REOPENED | CANCELLED |
|---|---|---|---|---|---|---|---|
| **NEW** | ✅ | ✅ | – | – | – | – | ✅ |
| **OPEN** | – | ✅ | – | – | – | – | ✅ |
| **IN_PROGRESS** | – | – | ✅ | ✅ | – | – | ✅ |
| **WAITING_FOR_REQUESTER** | – | ✅ | – | ✅ | – | – | ✅ |
| **RESOLVED** | – | – | – | – | ✅ | ✅ | – |
| **CLOSED** | – | – | – | – | – | ✅ | – |
| **REOPENED** | – | ✅ | ✅ | – | – | – | ✅ |
| **CANCELLED** | – | – | – | – | – | – | – (terminal) |

- Only IT Staff or Administrator may trigger any transition (BR-10).
- Transitioning into `RESOLVED` or `CLOSED` requires the Ticket to have a Ticket Owner
  (an unassigned Ticket cannot be resolved or closed).
- Transitioning out of `RESOLVED`/`CLOSED` into `REOPENED` clears
  `requesterIndicatedResolved`.
- No confirmation dialog is required by this sprint for any transition except
  `CANCELLED`, which requires a confirmation step in the UI (destructive, terminal).
- Any transition not listed above is rejected with `409 INVALID_TRANSITION`.

## 6. UI Specification Summary

The full visual specification lives in `docs/lab-03/ui-spec.md` and extends
`docs/lab-02/ui-spec.md` without introducing a new visual system. Summary:

- **Application shell:** the Development Requester display and "Change Requester"
  action are removed and replaced by the authenticated user's name, role badge, and a
  Logout action; navigation items are rendered only for destinations permitted by the
  current role (Requester → My Tickets/Create Ticket; IT Staff → Ticket Queue; Admin →
  User Management), never simply hidden client-side without server enforcement.
- **Login:** centered card, email + password fields, inline validation, busy state,
  single generic failure message (BR-02), link-free (no self-registration/reset in
  scope).
- **Change Password (mandatory):** full-screen, non-dismissible while
  `mustChangePassword = true`; new password + confirmation fields, rule hints, busy/
  success/failure states.
- **Requester screens:** Lab 2 My Tickets/Create Ticket/Ticket Detail are unchanged in
  layout; Ticket Detail gains a Public Comments thread (chronological, author + time)
  and a "Problem Appears Resolved" toggle/button, visually distinct from status badges.
- **IT Staff Ticket Queue:** search box, filter row (Status/Priority/Ownership),
  sortable columns, paginated table (desktop) collapsing to cards (mobile); columns
  limited to Ticket Number, Created Date, Summary, Category, Requested Priority, IT
  Priority, Current Status, Ticket Owner, Last Updated (per handout §8.3) to avoid an
  unreadable mega-grid.
- **IT Staff Ticket Detail:** extends the Lab 2 Ticket Detail layout with an operational
  panel (Ticket Owner + Claim/Reassign, IT Priority selector, Status selector with only
  legal next states enabled) and two visually distinct threads — Public Comments (green,
  requester-visible) and Internal Notes (amber/grey, staff-only) — so private content is
  never mistaken for public content.
- **Administrator User Management:** single screen, user table (Name, Email, Role,
  Status, Edit), search bar, optional role filter dropdown, and a create/edit modal or
  side panel with name/email/role/activation fields and a "Set new initial password"
  action; self-deactivation and last-Administrator controls are disabled (not just
  hidden) with an explanatory tooltip when inapplicable.
- **Shared conventions:** Zen Green palette and tokens from Lab 2 §6 are reused as-is;
  new badges are added for Role (Requester/IT Staff/Administrator) and for the four new
  Ticket statuses, following the existing badge component pattern; editable vs.
  read-only field styling, validation-message placement, and focus states are unchanged.

## 7. Data Changes

All models remain in the shared root-level `prisma/schema.prisma`. `RequesterUser` is
renamed and generalized to `User`; all other Lab 2 models are preserved and extended.

```prisma
enum Role {
  REQUESTER
  IT_STAFF
  ADMINISTRATOR
}

enum Priority {
  LOW
  MEDIUM
  HIGH
}

enum TicketStatus {
  NEW
  OPEN
  IN_PROGRESS
  WAITING_FOR_REQUESTER
  RESOLVED
  CLOSED
  REOPENED
  CANCELLED
}

model User {
  id                 Int       @id @default(autoincrement())
  name               String
  email              String    @unique
  passwordHash       String
  role               Role
  isActive           Boolean   @default(true)
  mustChangePassword Boolean   @default(false)
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  ticketsRequested   Ticket[]            @relation("TicketRequester")
  ticketsOwned       Ticket[]            @relation("TicketOwner")
  comments           TicketComment[]
  notes              TicketInternalNote[]

  @@index([role])
}

model Category {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  tickets   Ticket[]
}

model RelatedSystem {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  tickets   Ticket[]
}

model Ticket {
  id                       Int           @id @default(autoincrement())
  ticketNumber             String        @unique
  requesterId              Int
  requester                User          @relation("TicketRequester", fields: [requesterId], references: [id])
  ticketOwnerId            Int?
  ticketOwner              User?         @relation("TicketOwner", fields: [ticketOwnerId], references: [id])
  categoryId               Int
  category                 Category      @relation(fields: [categoryId], references: [id])
  relatedSystemId          Int
  relatedSystem            RelatedSystem @relation(fields: [relatedSystemId], references: [id])
  summary                  String
  description              String
  requestedPriority        Priority
  itPriority                Priority?
  currentStatus            TicketStatus  @default(NEW)
  requesterIndicatedResolved Boolean     @default(false)
  createdAt                DateTime      @default(now())
  updatedAt                DateTime      @updatedAt
  attachments               Attachment[]
  publicComments            TicketComment[]
  internalNotes             TicketInternalNote[]

  @@index([requesterId])
  @@index([ticketOwnerId])
  @@index([categoryId])
  @@index([currentStatus])
  @@index([createdAt])
}

model TicketComment {
  id        Int      @id @default(autoincrement())
  ticketId  Int
  ticket    Ticket   @relation(fields: [ticketId], references: [id])
  authorId  Int
  author    User     @relation(fields: [authorId], references: [id])
  content   String
  createdAt DateTime @default(now())

  @@index([ticketId])
}

model TicketInternalNote {
  id        Int      @id @default(autoincrement())
  ticketId  Int
  ticket    Ticket   @relation(fields: [ticketId], references: [id])
  authorId  Int
  author    User     @relation(fields: [authorId], references: [id])
  content   String
  createdAt DateTime @default(now())

  @@index([ticketId])
}

model Attachment {
  id               Int       @id @default(autoincrement())
  ticketId         Int
  ticket           Ticket    @relation(fields: [ticketId], references: [id])
  originalFileName String
  storedFileName   String    @unique
  mimeType         String
  sizeBytes        Int
  uploadedAt       DateTime  @default(now())
  isRemoved        Boolean   @default(false)
  removedAt        DateTime?
  removalReason    String?

  @@index([ticketId])
}
```

**Design decisions:**
- `RequesterUser` is renamed to `User` rather than kept as a separate table with a new
  `StaffUser`/`AdminUser` table, because Lab 3 explicitly states one User has exactly
  one role — a single table with a `role` enum avoids duplicate-identity problems (one
  person cannot accidentally exist as both a Requester row and a Staff row) and keeps
  the foreign keys on `Ticket`, `TicketComment`, and `TicketInternalNote` simple.
- `Ticket.requesterId` keeps its name and column type; only its target table changes
  (migration renames the referenced table, not the column), so existing Ticket rows
  need no data change beyond the FK target.
- `ticketOwnerId` is nullable to represent an unassigned Ticket, and is a separate
  relation (`"TicketOwner"`) from `requesterId` (`"TicketRequester"`) because the same
  `User` table now serves both roles and Prisma requires named relations to
  disambiguate the two foreign keys to the same target model.
- `itPriority` becomes writable (previously read-only/reserved in Lab 2) now that the
  IT Staff workflow that owns it exists.
- `requesterIndicatedResolved` is a boolean, not a status value, so that "Requester
  thinks it's fixed" never collides with or overrides the authoritative `currentStatus`
  state machine owned by IT Staff/Administrator (BR-09, BR-10).
- `TicketComment` and `TicketInternalNote` are separate models rather than one model
  with a `isInternal` flag, so that a single missing `WHERE` clause in a query cannot
  leak Internal Notes to a Requester-facing endpoint — the two are structurally
  unqueryable from the same Prisma call.
- Passwords are stored only as `passwordHash`; no `password` column ever exists.
- Indexes are added on `ticketOwnerId` (IT Staff queue filters by ownership) and
  `role` on `User` (Administrator list filtering), alongside the Lab 2 indexes.

### 7.1 Migration from Lab 2

1. Rename table/model `RequesterUser` → `User`; add `passwordHash`, `role`
   (backfilled `REQUESTER` for all existing rows), `mustChangePassword` (backfilled
   `true`), `updatedAt`.
2. Generate one system-generated initial password per migrated Requester (never
   derived from existing data), hash it, and write it to a local-only,
   git-ignored file for course testing — never to the repository or console logs in
   plaintext beyond local developer output.
3. Add `ticketOwnerId` (nullable) to `Ticket`; existing Tickets are migrated as
   unassigned (`null`) since Lab 2 had no Ticket Owner concept.
4. Extend the `TicketStatus` enum with the four new values; existing Ticket rows keep
   their current status unchanged (all Lab 2 seed/created Tickets are `NEW`, `OPEN`,
   `IN_PROGRESS`, or `RESOLVED`, all of which remain valid values).
5. Add `TicketComment` and `TicketInternalNote` tables (empty on migration; no Lab 2
   data existed for either).
6. Remove all server code paths and client code that reference `x-requester-id` or the
   Development Requester Selection screen.
7. Regression-test every Lab 2 endpoint and screen against the new session-derived
   identity before this sprint is considered complete (§10).

### 7.2 Seed Data

- At least 4 active Requesters + 1 inactive Requester (role `REQUESTER`).
- At least 3 active IT Staff + 1 inactive IT Staff (role `IT_STAFF`).
- At least 1 active Administrator (role `ADMINISTRATOR`).
- Seed script is idempotent (safe to re-run); seeded passwords are documented in
  `README.md` as local-development-only, never real credentials.
- Realistic Tickets spread across Requesters, all statuses, both priorities, and a mix
  of assigned/unassigned ownership; example Public Comments and Internal Notes that
  contain no sensitive information.

## 8. API Contract

Full request/response shapes, statuses, and error cases are defined in
`docs/lab-03/api-spec.md`. Summary of the identity mechanism and new/changed endpoints:

- **Authenticated identity:** login issues a server-side session referenced by an
  `httpOnly`, `SameSite=Lax`, `Secure` (in production) cookie. No token or secret is
  ever exposed to client-side JavaScript. Every protected endpoint re-derives the
  acting user and role from the session store on each request; the `x-requester-id`
  header from Lab 2 is removed entirely. CSRF exposure is limited by `SameSite=Lax` and
  by restricting state-changing routes to `POST`/`PATCH`/`DELETE` verbs only.

| Method & Path | Purpose | Roles |
|---|---|---|
| `POST /api/auth/login` | Authenticate with email + password, start session | Public |
| `POST /api/auth/logout` | End the current session | Any authenticated |
| `GET /api/auth/me` | Retrieve current identity + `mustChangePassword` | Any authenticated |
| `POST /api/auth/change-password` | Save a new password, clear `mustChangePassword` | Any authenticated |
| `POST /api/tickets`, `GET /api/tickets`, `GET /api/tickets/:ticketNumber`, `POST /api/tickets/:ticketNumber/attachments`, `GET /api/attachments/:id`, `GET /api/attachments/:id/download`, `PATCH /api/attachments/:id/remove` | Lab 2 Requester functions, now session-scoped | Requester (owner only) |
| `POST /api/tickets/:ticketNumber/comments` | Post a Public Comment | Requester (owner), IT Staff, Administrator |
| `PATCH /api/tickets/:ticketNumber/resolved-indication` | Requester marks "appears resolved" | Requester (owner) |
| `GET /api/staff/tickets` | IT Staff Ticket Queue (search/filter/sort/paginate) | IT Staff, Administrator |
| `GET /api/staff/tickets/:ticketNumber` | Ticket Detail for staff | IT Staff, Administrator |
| `PATCH /api/staff/tickets/:ticketNumber/claim` | Claim or reassign ownership | IT Staff, Administrator |
| `PATCH /api/staff/tickets/:ticketNumber/priority` | Set IT Priority | IT Staff, Administrator |
| `PATCH /api/staff/tickets/:ticketNumber/status` | Change Current Status | IT Staff, Administrator |
| `POST /api/staff/tickets/:ticketNumber/notes` | Create an Internal Note | IT Staff, Administrator |
| `GET /api/admin/users` | List/search/filter users | Administrator |
| `POST /api/admin/users` | Create a user | Administrator |
| `PATCH /api/admin/users/:id` | Edit name/email/role/activation | Administrator |
| `PATCH /api/admin/users/:id/reset-password` | Issue a new initial password | Administrator |

Every endpoint above distinguishes `401` (not authenticated), `403` (authenticated but
wrong role/ownership, or `PASSWORD_CHANGE_REQUIRED`), `400`/`422` (invalid input),
`404` (not found / not owned), `409` (conflict — duplicate email, invalid transition,
last-Administrator protection, already-claimed race), and `500` (safe generic error),
following the Lab 2 error-shape convention (`{ error, message, fields? }`).

## 9. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-01 | Given an active user with valid credentials, when the user logs in, then the backend establishes authenticated access and returns the permitted user identity and role. |
| AC-02 | Given a user who must change the initial password, when login succeeds, then normal application screens remain unavailable until a valid new password is saved. |
| AC-03 | Given an authenticated Requester, when the client supplies another requesterId (or omits identity entirely), then the backend still applies the authenticated session identity and never returns another Requester's data. |
| AC-04 | Given a Requester account, when an Internal Note endpoint is requested, then the operation is rejected without exposing note content. |
| AC-05 | Given invalid credentials or an inactive account, when a user attempts to log in, then the same generic "Invalid email or password" message is shown regardless of which is true. |
| AC-06 | Given an authenticated user, when they click Logout, then the session is invalidated and any subsequent request with the old session cookie is treated as unauthenticated. |
| AC-07 | Given an unassigned Ticket, when IT Staff clicks Claim, then that IT Staff user becomes the Ticket Owner; when another IT Staff user then reassigns it, ownership transfers and both changes are reflected in Ticket Detail. |
| AC-08 | Given a Ticket in `IN_PROGRESS`, when IT Staff attempts a transition not listed in the transition matrix (e.g., directly to `CLOSED`), then the request is rejected with `409 INVALID_TRANSITION` and status is unchanged. |
| AC-09 | Given a Requester viewing their own Ticket Detail, when Internal Notes exist on that Ticket, then those notes are never present in the response or rendered on screen. |
| AC-10 | Given a Requester posts a Public Comment, when IT Staff opens that Ticket, then the comment is visible in the Public Comments thread with correct author and timestamp. |
| AC-11 | Given the last active Administrator account, when any Administrator attempts to deactivate it or reassign its role, then the request is rejected with `409 LAST_ADMIN_PROTECTED`. |
| AC-12 | Given an Administrator attempts to deactivate their own account, when the request is submitted, then it is rejected with `403 SELF_DEACTIVATION_FORBIDDEN`. |
| AC-13 | Given an existing active user's email, when an Administrator creates or edits a user with that same email, then the request is rejected with `409 DUPLICATE_EMAIL` and no user record is changed. |
| AC-14 | Given an Administrator resets a user's password, when that user next logs in with the new initial password, then they are routed to the mandatory Change Password screen before any other screen. |
| AC-15 | Given a migrated Lab 2 Requester with existing Tickets, when that user logs in with their migrated credentials, then their My Tickets list shows exactly the same Tickets they owned before migration. |
| AC-16 | Given a non-Administrator authenticated user, when they call any `/api/admin/*` endpoint directly, then the request is rejected with `403 FORBIDDEN` regardless of frontend navigation state. |
| AC-17 | Given the IT Staff Ticket Queue with more than one page of results, when IT Staff searches, filters, sorts, or paginates, then the returned subset and pagination metadata are correct and consistent with the applied parameters. |
| AC-18 | Given the app is viewed at a mobile viewport (<768px), when the IT Staff Ticket Queue or Administrator User Management screen is opened, then content is shown without horizontal page scrolling. |

## 10. Definition of Done

**Product completion (must all be true before the AI coding agent may report "done"):**
- [ ] All Functional Requirements (FR-01…FR-24) are implemented and manually verified.
- [ ] Every Acceptance Criterion (AC-01…AC-18) has at least one passing, traceable
      automated test (see `tests.md`).
- [ ] All Business Rules (BR-01…BR-28) are enforced server-side, not only in the UI.
- [ ] The Ticket Status Transition Matrix (§4.7) is enforced server-side with no
      client-only gating.
- [ ] `npx vitest run` and the Playwright E2E suite pass with zero failing, skipped, or
      `.only`/`.skip`-marked tests in `client/`, `server/`, and `e2e/`, on the final
      `main` branch.
- [ ] Every Lab 2 Requester capability still works end-to-end against the authenticated
      session identity (migration/regression evidence, AC-15).
- [ ] Login, Change Password, IT Staff Ticket Queue, IT Staff Ticket Detail, and
      Administrator User Management visually match `ui-spec.md` at desktop, tablet, and
      mobile breakpoints (screenshot-verified).
- [ ] Role and ownership authorization is verified with automated cross-role and
      cross-ownership tests for every protected endpoint (AC-03, AC-04, AC-16).
- [ ] No password is ever stored, logged, or committed in plaintext; `.env` and seed
      credential files remain git-ignored.
- [ ] README setup, migration, seed, and test-run instructions are current and were
      verified by literally running them from a clean clone.

**Course delivery requirements (checked separately):** GitHub Issues covering the
sprint, feature branches merged via peer-reviewed PRs into `lab3-staging`, one release
PR from `lab3-staging` into `main`, `reviewer.md` populated with real review evidence,
and the final submission PDF following the required Answer Part 1–9 structure.

## 11. Assumptions and Decisions

1. Session-based authentication (server-side session + `httpOnly` cookie) is chosen
   over JWT because it requires no client-side token storage or refresh logic, keeps
   secrets off the client entirely, and makes server-side logout/invalidation
   immediate and simple — appropriate for this course's same-origin, single-app stack.
2. `RequesterUser` is renamed and generalized to a single `User` table with a `role`
   enum (§7) rather than three separate tables, matching the handout's explicit "one
   User has one permitted role in Lab 3" statement.
3. Public Comments and Internal Notes are modeled as two separate tables rather than
   one table with an `isInternal` flag, trading a small amount of schema duplication
   for a structural guarantee against accidentally leaking Internal Notes (BR-27).
4. Administrator-issued initial passwords are system-generated (e.g., a random
   12-character string) rather than Administrator-chosen, since the handout excludes
   email delivery and an Administrator-chosen password could be guessable or reused.
5. "Problem Appears Resolved" is modeled as an independent boolean rather than a
   Ticket status value, so a Requester's opinion can never race with or overwrite the
   authoritative IT-Staff-owned status state machine.
6. The Ticket Status Transition Matrix (§4.7) is a new decision not fully fixed by the
   handout (which lists the required statuses but not the exact transition graph); it
   is designed so every status is reachable and only `CANCELLED` is terminal, keeping
   `RESOLVED`/`CLOSED` reversible via `REOPENED` as implied by the status list.
7. IT Staff and Administrator share identical Ticket-operation permissions in Lab 3
   (§4.3 of the handout says an Administrator does not automatically get IT Staff
   powers "unless the approved matrix explicitly permits it" — this spec explicitly
   permits it, since Lab 3 excludes a separate Administrator ticket-override screen and
   an Administrator otherwise could not test or unblock a stuck Ticket).
8. Migrated Lab 2 Requesters each receive one freshly generated initial password
   (never derived from their prior state, since Lab 2 had no password at all) and are
   forced through Change Password on first Lab 3 login, consistent with BR-23/BR-25.
