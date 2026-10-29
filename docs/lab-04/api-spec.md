# Lab 4 API Contract — TokTickIT Actions Taken, Ticket Workflow, Dashboards

**Base URL (dev):** `http://localhost:3000/api` · **Content-Type:** `application/json`
**Extends:** `docs/lab-03/api-spec.md`. Session authentication (§0 of Lab 3), the
role markers, the `PASSWORD_CHANGE_REQUIRED` gate, and the error shape
`{ "error": CODE, "message": text, "fields"?: { field: message } }` are unchanged.

Role markers: 🔓 public · 🔒R Requester (+ownership) · 🔒S IT Staff or Administrator ·
🔒A Administrator only.

Every protected endpoint below returns, before any business logic:
`401 NOT_AUTHENTICATED` (no/expired session), `403 PASSWORD_CHANGE_REQUIRED`,
`403 FORBIDDEN` (wrong role). Unexpected errors return `500 INTERNAL_ERROR` with a
generic message and no stack trace or SQL text.

## 0. Shared Objects

**ActionTaken**
```json
{
  "id": 41,
  "ticketNumber": "TKT-2026-000002",
  "actionAt": "2026-10-28T03:15:00.000Z",
  "description": "Reset the Wi-Fi profile and re-enrolled the certificate.",
  "result": "Laptop reconnects; issue gone after reboot.",
  "status": "COMPLETED",
  "performedBy": { "id": 12, "name": "Alex Kim" },
  "createdBy":   { "id": 12, "name": "Alex Kim" },
  "followUpRequired": true,
  "followUpNote": "Check again on Friday that the certificate auto-renews.",
  "attachmentNotes": "See attachment wifi-error.png",
  "completedAt": "2026-10-28T03:40:12.000Z",
  "cancelledAt": null,
  "createdAt": "2026-10-28T03:16:02.000Z",
  "updatedAt": "2026-10-28T03:40:12.000Z"
}
```
`clientRequestId` is never returned. Lists are ordered `actionAt` asc, `id` asc (BR-19).

**StatusChange**
```json
{ "id": 7, "fromStatus": "IN_PROGRESS", "toStatus": "RESOLVED",
  "changedBy": { "id": 12, "name": "Alex Kim" }, "changedAt": "2026-10-28T03:41:00.000Z" }
```
Ordered `changedAt` asc, `id` asc.

**ResolutionGate** (staff detail only, computed by the same function the status
endpoint uses)
```json
{ "canResolve": false, "blockers": ["OPEN_ACTIONS"] }
```
`blockers` ⊆ `["UNASSIGNED", "NO_COMPLETED_ACTION", "OPEN_ACTIONS"]`.
It is meaningful only when `RESOLVED` is in `legalNextStatuses`; the UI combines both.

**Active statuses** (used by filters and metrics):
`NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED`.

## 1. GET /api/staff/tickets/:ticketNumber 🔒S (changed — additive)

Lab 3 response plus:
```json
{
  "resolvedAt": null,
  "actionsTaken": [ /* ActionTaken[] */ ],
  "statusHistory": [ /* StatusChange[] */ ],
  "resolutionGate": { "canResolve": false, "blockers": ["NO_COMPLETED_ACTION"] },
  "legalNextStatuses": ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]
}
```
`404 NOT_FOUND` for an unknown ticket number.

## 2. GET /api/tickets/:ticketNumber 🔒R (owner) (changed — additive)

Lab 3 response plus `resolvedAt`, `actionsTaken` (same `ActionTaken` objects,
read-only), and `statusHistory`. Still **never** contains `internalNotes`, not even as
an empty key (Lab 3 AC-09). Another Requester's Ticket → `404 NOT_FOUND`.

## 3. GET /api/staff/tickets/:ticketNumber/actions 🔒S

- **200** `{ "data": ActionTaken[] }` (ordered, BR-19). Unknown ticket → `404`.

## 4. POST /api/staff/tickets/:ticketNumber/actions 🔒S

- **Request**
```json
{
  "actionAt": "2026-10-28T03:15:00.000Z",
  "description": "Reset the Wi-Fi profile.",
  "result": null,
  "followUpRequired": false,
  "followUpNote": null,
  "attachmentNotes": "See wifi-error.png",
  "performedById": 12,
  "clientRequestId": "6f1c7d1e-5c5b-4f3e-9a7e-1d7b0d3b2a10"
}
```
`performedById` optional (defaults to the session user). `createdById` and
`ticketId` are **never** read from the body (BR-01, BR-04). `status` is always
`PLANNED` on creation.
- **201** → `ActionTaken`.
- **200** → the existing `ActionTaken` in its current state, unchanged by the replay, when
  the same `clientRequestId` was already used on this Ticket **with the same payload**
  (idempotent replay, BR-18). The
  replay is answered before the `TICKET_NOT_ACTIVE` check and returns the action in its
  current state (e.g. CANCELLED after a ticket-cancel cascade). Check order: ticket (404) →
  validation (400, needs the ticket's creation time) → replay (200) /
  `IDEMPOTENCY_KEY_REUSED` → `TICKET_NOT_ACTIVE` → `INVALID_ASSIGNEE` → create. Inside the
  write transaction the active status is re-checked on the share-locked row; if the
  ticket became inactive, the key is looked up again first, so a retry whose original
  committed meanwhile still gets the replay (BR-18 before BR-10).
- **409 `IDEMPOTENCY_KEY_REUSED`** the same `clientRequestId` was already used on this
  Ticket with a **different** payload (any of `actionAt`, `description`, `result`,
  `followUpRequired`, `followUpNote`, `attachmentNotes`, `performedById`, compared after
  validation and trimming); body includes `"current": ActionTaken` (the original);
  nothing is saved.
- **400 `VALIDATION_ERROR`** with `fields` (all invalid fields at once):
  `actionAt` (missing, not ISO-8601 with a time zone, before the minute of ticket creation, > now + 5 min),
  `description` (empty / > 2000), `result` (> 2000), `followUpNote` (required when
  `followUpRequired` is true; > 1000), `attachmentNotes` (> 500),
  `clientRequestId` (not a UUID).
- **404 `NOT_FOUND`** unknown ticket.
- **409 `TICKET_NOT_ACTIVE`** ticket is RESOLVED, CLOSED, or CANCELLED (BR-10); re-checked on the
  share-locked ticket row inside the write transaction (§8), so it can also follow a
  concurrent status change.
- **422 `INVALID_ASSIGNEE`** `performedById` is not an active IT Staff/Administrator.

## 5. PATCH /api/staff/tickets/:ticketNumber/actions/:actionId 🔒S

Edit and/or assign an **open** Action Taken. Partial update: only supplied fields
change. Check order: ticket/action (404) → validation (400) → `TICKET_NOT_ACTIVE` (BR-10, also for actions a
ticket cancel has cancelled) → `ACTION_LOCKED` → `STALE_UPDATE` → `INVALID_ASSIGNEE`;
the ticket row is share-locked before the action row is written (§8).
- **Request**
```json
{
  "expectedUpdatedAt": "2026-10-28T03:16:02.000Z",
  "description": "Reset the Wi-Fi profile and certificate.",
  "actionAt": "2026-10-28T03:20:00.000Z",
  "result": "Partially fixed",
  "followUpRequired": true,
  "followUpNote": "Verify after next login.",
  "attachmentNotes": null,
  "performedById": 15
}
```
- **200** → updated `ActionTaken`.
- **400 `VALIDATION_ERROR`** same rules as §4, plus `expectedUpdatedAt` missing.
- **404 `NOT_FOUND`** unknown ticket, or action not belonging to that ticket.
- **409 `STALE_UPDATE`** `expectedUpdatedAt` ≠ stored `updatedAt`; body includes
  `"current": ActionTaken` so the client can refresh (BR-17).
- **409 `ACTION_LOCKED`** action is COMPLETED or CANCELLED (BR-09) - active ticket only;
  on an inactive ticket `TICKET_NOT_ACTIVE` is answered instead.
- **409 `TICKET_NOT_ACTIVE`** (BR-10; re-checked on the share-locked ticket row, §8).
- **422 `INVALID_ASSIGNEE`** (BR-05).

## 6. PATCH /api/staff/tickets/:ticketNumber/actions/:actionId/status 🔒S

Check order: ticket/action (404) → validation (400) → `TICKET_NOT_ACTIVE` → `ACTION_LOCKED` → `STALE_UPDATE` →
`INVALID_ACTION_TRANSITION` → Result required for COMPLETED (the `400 fields.result` comes
last because it depends on the stored Result).

- **Request** `{ "status": "COMPLETED", "result": "Fixed after reboot.", "expectedUpdatedAt": "…" }`
  (`result` optional if already stored; required for COMPLETED when the stored result
  is empty).
- **200** → updated `ActionTaken` (`completedAt` / `cancelledAt` set by the server).
- **400 `VALIDATION_ERROR`** invalid `status` value; `fields.result` when completing
  without a Result; `expectedUpdatedAt` missing.
- **409 `ACTION_LOCKED`** the action is COMPLETED or CANCELLED (checked before the
  transition rule, BR-09) - active ticket only; on an inactive ticket
  `TICKET_NOT_ACTIVE` is answered instead.
- **409 `INVALID_ACTION_TRANSITION`** a move between open states not allowed by BR-08
  (e.g. IN_PROGRESS → PLANNED, PLANNED → PLANNED).
- **409 `STALE_UPDATE`** (with `current`), **409 `TICKET_NOT_ACTIVE`** (re-checked on the
  share-locked ticket row, §8), **404**.

## 7. List endpoints — drill-down filters (changed — additive, backward compatible)

### 7.1 GET /api/tickets 🔒R (My Tickets)
New/extended query parameters (Lab 2/3 parameters unchanged):
| Param | Values | Meaning |
|---|---|---|
| `status` | one status **or a comma-separated list** | `currentStatus IN (...)`; any unknown value → `400 VALIDATION_ERROR` with `fields.status` (Lab 3 returned 500) |
| `resolvedWithinDays` | integer 1–365 | `resolvedAt ≥ now − N days` |

### 7.2 GET /api/staff/tickets 🔒S (Ticket Queue)
| Param | Values | Meaning |
|---|---|---|
| `status` | one status or comma-separated list | `currentStatus IN (...)`; any unknown value → `400 VALIDATION_ERROR` with `fields.status` (Lab 3 returned 500) |
| `priority` | `LOW\|MEDIUM\|HIGH\|NONE` | IT Priority; `NONE` = `itPriority IS NULL` |
| `requesterResolved` | `true` | `requesterIndicatedResolved = true` |
| `ownership` | `mine\|unassigned\|all` | unchanged |

Response shape unchanged (`data`, `pagination.totalItems`), which is what the
drill-down equality test compares with the dashboard value (BR-26).

### 7.3 GET /api/admin/users 🔒A
The Lab 3 endpoint supports only `search` and `role` and returns a plain array (no
`pagination`, Lab 3 api-spec §14). Lab 4 adds one optional, additive parameter:

| Param | Values | Meaning |
|---|---|---|
| `isActive` | `true\|false` | `isActive = value` |

Any other `isActive` value → `400 VALIDATION_ERROR` with `fields.isActive` (added after the PR #71 review). `role` keeps its Lab 3 behaviour (an unknown value is ignored).

The UI initialises its `role` and `isActive` filters from the URL
(`/admin/users?role=IT_STAFF&isActive=true`). For this list the drill-down equality
(BR-26) compares the card value with the length of the returned array.

## 8. PATCH /api/staff/tickets/:ticketNumber/status 🔒S (changed)

- **Request** `{ "currentStatus": "RESOLVED", "expectedUpdatedAt": "2026-10-28T03:40:12.000Z" }`
  (`expectedUpdatedAt` optional for Lab 3 compatibility - omitted or `null` means not
  sent; sent by the Lab 4 UI for every transition except CANCELLED, whose request body
  stays the Lab 3 one - the locked-row status re-check still rejects a concurrent
  status change).
- **Processing order:** validate value → load ticket (404) → stale check (409
  `STALE_UPDATE`) → matrix (409 `INVALID_TRANSITION`) → owner check for
  RESOLVED/CLOSED (409 `UNASSIGNED_TICKET`) → **one transaction**: lock the ticket
  row (`SELECT … FOR NO KEY UPDATE`) and re-read it → on the locked row: status and token
  unchanged (else 409 `STALE_UPDATE`) → owner for RESOLVED/CLOSED (else 409
  `UNASSIGNED_TICKET`) → resolution gate for RESOLVED (409 `RESOLUTION_BLOCKED`) →
  conditional update
  `WHERE id = :id AND currentStatus = :readStatus` (plus `AND updatedAt =
  :expectedUpdatedAt` when the token is sent; 0 rows → 409 `STALE_UPDATE`; defence in
  depth behind the locked-row re-check), set/clear `resolvedAt`, clear
  `requesterIndicatedResolved` on REOPENED, on CANCELLED set every PLANNED/IN_PROGRESS
  Action Taken of the ticket to CANCELLED (`cancelledAt` = `updatedAt` = the change time,
  BR-13/BR-17),
  insert `TicketStatusChange`. Every Action Taken write
  (`POST …/actions`, `PATCH …/actions/:actionId`, `PATCH …/actions/:actionId/status`)
  takes a share lock on the same ticket row (design rule: every transaction that
  writes Action Taken rows locks the ticket row first, which keeps the cancel cascade
  free of lock-order deadlocks)
  and re-reads its status in its own transaction, so a concurrent status change and
  action write are serialized: either the gate sees the new open action or the write
  gets `409 TICKET_NOT_ACTIVE`.
- **200**
```json
{
  "ticketNumber": "TKT-2026-000002",
  "currentStatus": "RESOLVED",
  "requesterIndicatedResolved": false,
  "resolvedAt": "2026-10-28T03:41:00.000Z",
  "updatedAt": "2026-10-28T03:41:00.000Z",
  "legalNextStatuses": ["CLOSED", "REOPENED"],
  "statusChange": { /* StatusChange */ }
}
```
- **409 `RESOLUTION_BLOCKED`**
```json
{ "error": "RESOLUTION_BLOCKED",
  "message": "This ticket cannot be resolved yet: complete or cancel the open actions.",
  "blockers": ["OPEN_ACTIONS"] }
```
  (`blockers` ⊆ `["NO_COMPLETED_ACTION", "OPEN_ACTIONS"]`; an unowned ticket fails
  earlier with `UNASSIGNED_TICKET`.)
- **409 `STALE_UPDATE`** (stale `expectedUpdatedAt`, or another request changed the
  status between the read and the conditional update): body includes `"current"`,
  the ticket's latest summary in the 200 shape without `statusChange`
  (`ticketNumber`, `currentStatus`, `requesterIndicatedResolved`, `resolvedAt`,
  `updatedAt`, `legalNextStatuses`).
- **400 `VALIDATION_ERROR`** with `fields.currentStatus` (missing/unknown value) and/or
  `fields.expectedUpdatedAt` (all invalid fields at once) (sent but not an ISO-8601 date-time with a time zone).
- **500 `INTERNAL_ERROR`** a lock wait longer than the 15 s transaction timeout
  (known limitation; a steady stream of share-locking action writes can delay a
  status change this long, since Postgres may grant new share locks ahead of it).

## 9. GET /api/dashboard/requester 🔒R

Scoped to the session user (BR-24); query parameters are ignored.
```json
{
  "generatedAt": "2026-10-28T09:00:00.000Z",
  "windowDays": 7,
  "metrics": {
    "openTickets":       { "value": 3,  "drillDown": "/tickets?status=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED" },
    "waitingForMe":      { "value": 1,  "drillDown": "/tickets?status=WAITING_FOR_REQUESTER" },
    "resolvedLast7Days": { "value": 2,  "drillDown": "/tickets?status=RESOLVED,CLOSED&resolvedWithinDays=7" },
    "closedTickets":     { "value": 12, "drillDown": "/tickets?status=CLOSED" }
  },
  "attentionTickets": [
    { "ticketNumber": "TKT-2026-000003", "summary": "Need software license reactivated",
      "currentStatus": "WAITING_FOR_REQUESTER", "updatedAt": "2026-10-27T10:00:00.000Z" }
  ],
  "recentTickets": [ /* same item shape, max 5 */ ]
}
```
Empty: all `value` = 0, lists = `[]` (BR-25). IT Staff/Administrator → `403 FORBIDDEN`.

## 10. GET /api/dashboard/staff 🔒S

```json
{
  "generatedAt": "2026-10-28T09:00:00.000Z",
  "windowDays": 7,
  "metrics": {
    "unassignedOpen":   { "value": 4, "drillDown": "/staff/tickets?ownership=unassigned&status=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED" },
    "myOpenTickets":    { "value": 6, "drillDown": "/staff/tickets?ownership=mine&status=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED" },
    "awaitingReview":   { "value": 1, "drillDown": "/staff/tickets?requesterResolved=true&status=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED" },
    "highPriorityOpen": { "value": 3, "drillDown": "/staff/tickets?priority=HIGH&status=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED" },
    "myOpenActions":    { "value": 2, "drillDown": "#my-open-actions" }
  },
  "byStatus": { "NEW": 2, "OPEN": 1, "IN_PROGRESS": 3, "WAITING_FOR_REQUESTER": 1,
                "RESOLVED": 2, "CLOSED": 1, "REOPENED": 1, "CANCELLED": 1 },
  "byItPriority": { "LOW": 2, "MEDIUM": 3, "HIGH": 3, "NONE": 1 },
  "myOpenActionsList": [
    { "id": 41, "ticketNumber": "TKT-2026-000002", "ticketSummary": "Cannot connect to campus Wi-Fi",
      "description": "Reset the Wi-Fi profile.", "status": "IN_PROGRESS",
      "actionAt": "2026-10-28T03:15:00.000Z", "followUpRequired": false }
  ],
  "urgentTickets": [ { "ticketNumber": "…", "summary": "…", "currentStatus": "OPEN", "itPriority": "HIGH", "ticketOwner": null, "createdAt": "…" } ],
  "recentTickets": [ { "ticketNumber": "…", "summary": "…", "currentStatus": "…", "updatedAt": "…" } ],
  "userAccounts": { "activeRequesters": 5, "activeItStaff": 3, "activeAdministrators": 1, "inactive": 2 }
}
```
`byStatus` always contains all 8 keys and `byItPriority` all 4 keys (zeros included),
each with drill-down `/staff/tickets?status=<S>` or
`/staff/tickets?priority=<P>&status=<active>` built by the client from the key.
`userAccounts` is present **only** for an Administrator (BR-27). Requester → `403`.

## 11. Health endpoints 🔓

- `GET /api/health` — **unchanged from Lab 1**: **200**
  `{ "status": "ok", "service": "TokTickIT API" }` (the Lab 1 test asserts this exact
  body).
- `GET /api/health/db` (new, public) — runs `SELECT 1`: **200** `{ "database": "ok" }`;
  **503** `{ "database": "unreachable" }` when the query fails (no error detail in the
  body).

## 12. Removed / Not Provided

- No `DELETE` on Actions Taken, Status History, Public Comments, or Internal Notes
  (append-only, BR-09). A `DELETE` request to these paths returns `404 NOT_FOUND`
  (no route).
- No endpoint lets a Requester create or change Actions Taken or the Ticket status.

## 13. HTTP Status Code Summary (Lab 4 additions)

| Status | Codes |
|---|---|
| 200 | idempotent replay of an Action Taken create |
| 400 | `VALIDATION_ERROR` (Action Taken fields, unknown status in list filter, invalid `isActive` on `GET /api/admin/users`, missing `expectedUpdatedAt` on Action Taken updates, invalid `currentStatus` or `expectedUpdatedAt` on the ticket status change) |
| 409 | `RESOLUTION_BLOCKED`, `STALE_UPDATE`, `INVALID_ACTION_TRANSITION`, `ACTION_LOCKED`, `TICKET_NOT_ACTIVE`, `IDEMPOTENCY_KEY_REUSED` (+ Lab 3 codes) |
| 422 | `INVALID_ASSIGNEE` (+ Lab 3 `INVALID_OWNER`) |
| 503 | `GET /api/health/db` with database unreachable |

## 14. Role Authorization Matrix (backend-enforced)

| Operation | Requester | IT Staff | Administrator |
|---|---|---|---|
| Read Actions Taken / Status History of own Ticket | ✅ (read-only) | ✅ any Ticket | ✅ any Ticket |
| Read Actions Taken of another Requester's Ticket | ❌ 404 | ✅ | ✅ |
| Create / edit / assign / start / complete / cancel Action Taken | ❌ 403 | ✅ | ✅ |
| Be the Performed by of an Action Taken | ❌ (422) | ✅ (active) | ✅ (active) |
| Change Ticket status (incl. resolve, close, reopen, cancel) | ❌ 403 | ✅ | ✅ |
| Set "Problem Appears Resolved" | ✅ own Ticket | ❌ 403 | ❌ 403 |
| Requester dashboard | ✅ own data | ❌ 403 | ❌ 403 |
| Staff dashboard | ❌ 403 | ✅ | ✅ + `userAccounts` |
| Read Internal Notes | ❌ 403 | ✅ | ✅ |
| User management (`/api/admin/*`) | ❌ 403 | ❌ 403 | ✅ |
| Health (`GET /api/health`, `GET /api/health/db`) | ✅ public | ✅ public | ✅ public |
