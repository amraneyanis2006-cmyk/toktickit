# Lab 3 API Contract — TokTickIT Authentication, Roles, IT Staff Ticketing, and Admin User Management

**Base URL (dev):** `http://localhost:3000/api`
**Content-Type:** `application/json` unless noted (attachment upload uses
`multipart/form-data`; attachment download returns the raw file).
**Extends:** `docs/lab-02/api-spec.md`. The `x-requester-id` header (Lab 2 §0) is
**removed entirely** and replaced by the session mechanism below.

## 0. Session Authentication (replaces the Lab 2 `x-requester-id` header)

Login issues a session referenced by a cookie:

```
Set-Cookie: sid=<opaque session id>; HttpOnly; SameSite=Lax; Secure (prod only); Path=/
```

- The client never reads or sets this cookie manually — the browser handles it, and
  client fetch calls use `credentials: "include"`.
- Every protected endpoint (marked 🔒 below) re-derives `{ userId, role }` from the
  session store on each request. A session references a `User.id`; if that user has
  since been deactivated, the session is treated as invalid (see below).
- **Missing/invalid/expired session** → `401 Unauthorized`,
  `{ "error": "NOT_AUTHENTICATED", "message": "Please log in." }`
- **Valid session, but the underlying user is now inactive** → `401 Unauthorized`,
  `{ "error": "NOT_AUTHENTICATED", "message": "Please log in." }` (session is destroyed
  server-side on this detection).
- **Valid session, `mustChangePassword = true`, endpoint is not one of
  `/api/auth/logout`, `/api/auth/me`, `/api/auth/change-password`** → `403 Forbidden`,
  `{ "error": "PASSWORD_CHANGE_REQUIRED", "message": "You must change your password before continuing." }`
- **Valid session, wrong role for the endpoint** → `403 Forbidden`,
  `{ "error": "FORBIDDEN", "message": "You do not have access to this resource." }`
- Sessions expire after 8 hours of inactivity (BR-06); expiry behaves identically to
  "missing session" above.

Role markers used below: 🔓 public · 🔒R Requester (+ownership) · 🔒S IT Staff or
Administrator · 🔒A Administrator only · 🔒* any authenticated user.

## 1. POST /api/auth/login 🔓

- **Request body**
```json
{ "email": "jennifer.anderson@example.com", "password": "Str0ngPass!" }
```
- **Validation — 400 `VALIDATION_ERROR`:** `email` or `password` missing.
- **Failure — 401 `INVALID_CREDENTIALS`:** email not found, wrong password, OR account
  inactive — identical response in all three cases (BR-02):
  `{ "error": "INVALID_CREDENTIALS", "message": "Invalid email or password." }`
- **Success — 200**
```json
{
  "id": 7,
  "name": "Jennifer Anderson",
  "email": "jennifer.anderson@example.com",
  "role": "REQUESTER",
  "mustChangePassword": false
}
```
(Session cookie is set via response header, not body.)
- **Failure — 500**: `{ "error": "INTERNAL_ERROR", "message": "Unable to log in." }`

## 2. POST /api/auth/logout 🔒*

- **Request body:** none.
- **Success — 200**: `{ "loggedOut": true }` (session destroyed; `Set-Cookie` clears
  `sid`).
- **Failure — 401**: see §0 (already unauthenticated — treated as a no-op success in
  practice, still returns 200).

## 3. GET /api/auth/me 🔒*

- **Success — 200**: same shape as §1 success body.
- **Failure — 401**: see §0.
- Note: this endpoint is exempt from the `PASSWORD_CHANGE_REQUIRED` gate so the client
  can always determine whether to route to Change Password.

## 4. POST /api/auth/change-password 🔒*

- **Request body**
```json
{ "currentPassword": "TempInit!23", "newPassword": "NewStrongPass!45" }
```
- **Validation — 400 `VALIDATION_ERROR`:**
  - `newPassword` shorter than 8 characters (BR-05)
  - `newPassword` equals `currentPassword` (BR-05)
  - `currentPassword` does not match the stored hash →
    `{ "error": "VALIDATION_ERROR", "fields": { "currentPassword": "Current password is incorrect." } }`
- **Success — 200**
```json
{ "id": 7, "mustChangePassword": false }
```
- **Failure — 401**: see §0. This endpoint is exempt from the
  `PASSWORD_CHANGE_REQUIRED` gate (it is how that gate gets cleared).
- **Failure — 500**: `{ "error": "INTERNAL_ERROR", "message": "Unable to change password." }`

## 5. Lab 2 Requester Endpoints (unchanged shapes, session-scoped)

`POST /api/tickets`, `GET /api/tickets`, `GET /api/tickets/:ticketNumber`,
`POST /api/tickets/:ticketNumber/attachments`, `GET /api/attachments/:id`,
`GET /api/attachments/:id/download`, `PATCH /api/attachments/:id/remove` — all 🔒R,
identical request/response shapes and status codes to `docs/lab-02/api-spec.md` §4–10,
**except**: the acting Requester is now `session.userId` instead of the
`x-requester-id` header value. `401`/`403` replace the old header-specific
`MISSING_REQUESTER`/`INVALID_REQUESTER`/`REQUESTER_INACTIVE` codes with the unified
codes in §0. `404 NOT_FOUND` on cross-Requester access is unchanged (BR-26).

## 6. POST /api/tickets/:ticketNumber/comments 🔒R (owner) or 🔒S

Post a Public Comment. Allowed for the Requester who owns the Ticket, or any IT Staff /
Administrator.

- **Request body**
```json
{ "content": "I tried restarting but the issue persists." }
```
- **Validation — 400 `VALIDATION_ERROR`:** `content` missing, empty after trim, or
  over 2000 characters.
- **Success — 201**
```json
{
  "id": 12,
  "ticketId": 101,
  "authorId": 7,
  "authorName": "Jennifer Anderson",
  "authorRole": "REQUESTER",
  "content": "I tried restarting but the issue persists.",
  "createdAt": "2026-09-01T10:00:00.000Z"
}
```
- **Not found — 404**: Ticket does not exist, or (Requester caller only) exists but is
  not owned by the caller — identical response either way (BR-26).
- **Failure — 401 / 403**: see §0.

## 7. PATCH /api/tickets/:ticketNumber/resolved-indication 🔒R (owner)

Requester marks the problem as appearing resolved. Idempotent.

- **Request body:** none.
- **Success — 200**
```json
{ "ticketNumber": "TKT-2026-000101", "requesterIndicatedResolved": true }
```
- **Not found — 404**: Ticket not owned by caller (BR-26).
- **Failure — 401 / 403**: see §0.

## 8. GET /api/staff/tickets 🔒S

IT Staff Ticket Queue across all Requesters.

- **Query parameters**

| Param | Type | Default | Notes |
|---|---|---|---|
| `search` | string | — | Matches `ticketNumber` OR `summary`, case-insensitive substring |
| `status` | `TicketStatus` | — | Filters by `currentStatus` |
| `priority` | `LOW\|MEDIUM\|HIGH` | — | Filters by `itPriority` |
| `ownership` | `mine\|unassigned\|all` | `all` | `mine` = `ticketOwnerId = session.userId`; `unassigned` = `ticketOwnerId IS NULL` |
| `sortBy` | `createdAt\|ticketNumber\|updatedAt` | `createdAt` | Invalid falls back to default |
| `sortDir` | `asc\|desc` | `desc` | Invalid falls back to `desc` |
| `page` | int ≥ 1 | `1` | Invalid/out-of-range falls back to `1` |
| `pageSize` | int, 1–100 | `10` | Invalid/out-of-range falls back to `10` |

- **Success — 200**
```json
{
  "data": [
    {
      "id": 101,
      "ticketNumber": "TKT-2026-000101",
      "summary": "Laptop battery drains quickly",
      "categoryName": "Hardware",
      "requestedPriority": "MEDIUM",
      "itPriority": "MEDIUM",
      "currentStatus": "OPEN",
      "ticketOwner": { "id": 3, "name": "Alex Kim" },
      "createdAt": "2026-08-22T09:14:00.000Z",
      "updatedAt": "2026-08-30T11:02:00.000Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 10, "totalItems": 87, "totalPages": 9 }
}
```
- No ownership filtering applied by default (BR-17); `ticketOwner` is `null` when
  unassigned.
- **Failure — 401 / 403**: see §0.
- **Failure — 500**: `{ "error": "INTERNAL_ERROR", "message": "Unable to load tickets." }`

## 9. GET /api/staff/tickets/:ticketNumber 🔒S

Retrieve one Ticket for staff, including Attachments, Public Comments, and Internal
Notes.

- **Success — 200**
```json
{
  "id": 101,
  "ticketNumber": "TKT-2026-000101",
  "requester": { "id": 7, "name": "Jennifer Anderson", "email": "jennifer.anderson@example.com" },
  "ticketOwner": { "id": 3, "name": "Alex Kim" },
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 8, "name": "Corporate Laptop" },
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual...",
  "requestedPriority": "MEDIUM",
  "itPriority": "MEDIUM",
  "currentStatus": "OPEN",
  "requesterIndicatedResolved": false,
  "createdAt": "2026-08-22T09:14:00.000Z",
  "updatedAt": "2026-08-30T11:02:00.000Z",
  "attachments": [ "...same shape as docs/lab-02/api-spec.md §6..." ],
  "publicComments": [ "...same shape as §6 success body, as an array..." ],
  "internalNotes": [ "...same shape as §11 success body, as an array..." ]
}
```
- **Not found — 404**: `{ "error": "NOT_FOUND", "message": "Ticket not found." }`
- **Failure — 401 / 403**: see §0.

## 10. PATCH /api/staff/tickets/:ticketNumber/claim 🔒S

Claim an unassigned Ticket (self), or reassign an already-owned Ticket to any active
IT Staff/Administrator user.

- **Request body**
```json
{ "ticketOwnerId": 3 }
```
(Omit `ticketOwnerId`, or set it to `null`, is invalid — claim/reassign always targets
a specific user; to claim for yourself the client sends its own `session.userId`.)
- **Validation — 400 `VALIDATION_ERROR`:** `ticketOwnerId` missing.
- **Validation — 422 `INVALID_OWNER`:** `ticketOwnerId` does not reference an active
  user with role `IT_STAFF` or `ADMINISTRATOR` (BR-11).
- **Success — 200**
```json
{ "ticketNumber": "TKT-2026-000101", "ticketOwner": { "id": 3, "name": "Alex Kim" } }
```
- **Conflict — 409 `OWNERSHIP_CHANGED`:** the Ticket's `updatedAt` sent by the client
  (optimistic-concurrency check) no longer matches the current row — another staff
  member changed ownership first. Client re-fetches and shows the new state.
- **Not found — 404**: Ticket not found.
- **Failure — 401 / 403**: see §0.

## 11. PATCH /api/staff/tickets/:ticketNumber/priority 🔒S

Set IT Priority.

- **Request body**
```json
{ "itPriority": "HIGH" }
```
- **Validation — 400 `VALIDATION_ERROR`:** `itPriority` missing or not one of
  `LOW`/`MEDIUM`/`HIGH`.
- **Success — 200**: `{ "ticketNumber": "TKT-2026-000101", "itPriority": "HIGH" }`
- **Not found — 404**: Ticket not found.
- **Failure — 401 / 403**: see §0.

## 12. PATCH /api/staff/tickets/:ticketNumber/status 🔒S

Change Current Status, enforcing the transition matrix in `specification.md` §4.7.

- **Request body**
```json
{ "currentStatus": "IN_PROGRESS" }
```
- **Validation — 400 `VALIDATION_ERROR`:** `currentStatus` missing or not a valid enum
  value.
- **Conflict — 409 `INVALID_TRANSITION`:** the requested target status is not reachable
  from the Ticket's current status per the transition matrix:
  `{ "error": "INVALID_TRANSITION", "message": "Cannot move from OPEN to CLOSED." }`
- **Conflict — 409 `UNASSIGNED_TICKET`:** target is `RESOLVED` or `CLOSED` and
  `ticketOwnerId` is `null`.
- **Success — 200**
```json
{ "ticketNumber": "TKT-2026-000101", "currentStatus": "IN_PROGRESS", "requesterIndicatedResolved": false }
```
(`requesterIndicatedResolved` is force-reset to `false` only when transitioning into
`REOPENED`; otherwise it is echoed unchanged.)
- **Not found — 404**: Ticket not found.
- **Failure — 401 / 403**: see §0.

## 13. POST /api/staff/tickets/:ticketNumber/notes 🔒S

Create an Internal Note.

- **Request body**
```json
{ "content": "Escalated to hardware vendor, RMA #4471." }
```
- **Validation — 400 `VALIDATION_ERROR`:** `content` missing, empty after trim, or
  over 2000 characters.
- **Success — 201**
```json
{
  "id": 9,
  "ticketId": 101,
  "authorId": 3,
  "authorName": "Alex Kim",
  "content": "Escalated to hardware vendor, RMA #4471.",
  "createdAt": "2026-09-01T10:05:00.000Z"
}
```
- **Not found — 404**: Ticket not found.
- **Failure — 401 / 403 `FORBIDDEN`**: a Requester calling this endpoint is rejected
  before any note content is read from the database (BR-27, AC-04).

## 14. GET /api/admin/users 🔒A

- **Query parameters**

| Param | Type | Default | Notes |
|---|---|---|---|
| `search` | string | — | Matches `name` OR `email`, case-insensitive substring |
| `role` | `REQUESTER\|IT_STAFF\|ADMINISTRATOR` | — | Optional filter |

- **Success — 200**
```json
[
  { "id": 7, "name": "Jennifer Anderson", "email": "jennifer.anderson@example.com", "role": "REQUESTER", "isActive": true },
  { "id": 3, "name": "Alex Kim", "email": "alex.kim@example.com", "role": "IT_STAFF", "isActive": true }
]
```
(No pagination — out of scope per handout §8.5.)
- **Failure — 401 / 403**: see §0.

## 15. POST /api/admin/users 🔒A

Create a user with a system-generated initial password.

- **Request body**
```json
{ "name": "New Hire", "email": "new.hire@example.com", "role": "IT_STAFF", "isActive": true }
```
- **Validation — 400 `VALIDATION_ERROR`:** `name` missing, `email` missing/malformed,
  `role` missing/invalid.
- **Conflict — 409 `DUPLICATE_EMAIL`:** email already in use by any user, any role
  (BR-19): `{ "error": "DUPLICATE_EMAIL", "message": "This email address is already in use." }`
- **Success — 201**
```json
{
  "id": 42,
  "name": "New Hire",
  "email": "new.hire@example.com",
  "role": "IT_STAFF",
  "isActive": true,
  "mustChangePassword": true
}
```
(The generated initial password is never returned in this response in production; for
local course testing it is written only to server console/log, never to the HTTP
response, per BR-04/BR-23.)
- **Failure — 500**: `{ "error": "INTERNAL_ERROR", "message": "Unable to create user." }`

## 16. PATCH /api/admin/users/:id 🔒A

Edit name, email, role, activation state.

- **Request body** (all fields optional; only supplied fields are changed)
```json
{ "name": "Jennifer A. Anderson", "isActive": false }
```
- **Validation — 400 `VALIDATION_ERROR`:** malformed `email`, invalid `role`.
- **Conflict — 409 `DUPLICATE_EMAIL`:** `email` collides with another user (BR-19).
- **Forbidden — 403 `SELF_DEACTIVATION_FORBIDDEN`:** caller sets `isActive: false` on
  their own `id` (BR-22).
- **Conflict — 409 `LAST_ADMIN_PROTECTED`:** target is the last active Administrator
  and the request would deactivate them or change their `role` away from
  `ADMINISTRATOR` (BR-22).
- **Success — 200**: same shape as §15 success body (without `mustChangePassword`
  change unless also reset via §17).
- **Not found — 404**: `{ "error": "NOT_FOUND", "message": "User not found." }`
- **Failure — 401 / 403**: see §0.

## 17. PATCH /api/admin/users/:id/reset-password 🔒A

Issue a new system-generated initial password.

- **Request body:** none.
- **Success — 200**
```json
{ "id": 7, "mustChangePassword": true }
```
(New password delivered the same way as §15 — server-side/local-testing channel only,
never in the JSON response.)
- **Not found — 404**: User not found.
- **Failure — 401 / 403**: see §0.

## 18. HTTP Status Code Summary (Lab 3 additions to Lab 2 §11)

| Status | Meaning |
|---|---|
| 401 | Not authenticated (no/expired/invalid session, or underlying user deactivated) |
| 403 | Authenticated but forbidden: wrong role, `PASSWORD_CHANGE_REQUIRED`, `SELF_DEACTIVATION_FORBIDDEN` |
| 404 | Resource does not exist, or (Requester case) exists but not owned by caller |
| 409 | `DUPLICATE_EMAIL`, `INVALID_TRANSITION`, `UNASSIGNED_TICKET`, `LAST_ADMIN_PROTECTED`, `OWNERSHIP_CHANGED` |
| 422 | `INVALID_OWNER` (claim/reassign target is not an active IT Staff/Administrator) |

All other Lab 2 codes (200/201/400/413/422 file errors/500) are unchanged; see
`docs/lab-02/api-spec.md` §11.

## 19. Error Response Shape

Unchanged from Lab 2:
```json
{ "error": "MACHINE_READABLE_CODE", "message": "Human-readable explanation.", "fields": { "optional": "per-field detail" } }
```
`fields` is present only for `VALIDATION_ERROR` responses. No error response ever
includes stack traces, SQL, session ids, or internal file paths.
