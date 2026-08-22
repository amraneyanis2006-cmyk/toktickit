# Lab 2 API Contract — TokTickIT Requester Ticketing MVP

**Base URL (dev):** `http://localhost:3000/api`
**Content-Type:** `application/json` unless noted (attachment upload uses
`multipart/form-data`; attachment download returns the raw file).

## 0. Requester Identity Header (temporary testing mechanism)

Every Requester-scoped endpoint (marked 🔒 below) requires:

```
x-requester-id: <integer RequesterUser.id>
```

Behavior:
- Missing header → `401 Unauthorized`, `{ "error": "MISSING_REQUESTER", "message": "A development requester must be selected." }`
- Header present but no matching `RequesterUser` → `401 Unauthorized`,
  `{ "error": "INVALID_REQUESTER" }`
- Header present, Requester exists but `isActive = false` → `403 Forbidden`,
  `{ "error": "REQUESTER_INACTIVE", "message": "This development requester is no longer active." }`

This header is a **Lab 2 testing mechanism only** (BR-03, BR-28) — it is trivially
spoofable and is replaced by real session-derived identity in Lab 3.

## 1. GET /api/categories

Retrieve active Categories, for populating the Create Ticket / filter dropdowns.

- **Auth:** none (public reference data)
- **Query params:** none
- **Success — 200**
```json
[
  { "id": 1, "name": "Account and Access" },
  { "id": 2, "name": "Hardware" },
  { "id": 3, "name": "Software" },
  { "id": 4, "name": "Network" }
]
```
- **Failure — 500**: `{ "error": "INTERNAL_ERROR", "message": "Unable to load categories." }`

## 2. GET /api/related-systems

Retrieve active Related Systems.

- **Auth:** none
- **Success — 200**
```json
[
  { "id": 1, "name": "Email" },
  { "id": 2, "name": "Campus Wi-Fi" },
  { "id": 3, "name": "VPN" }
]
```
- **Failure — 500**: same shape as §1.

## 3. GET /api/requesters

Retrieve active Development Requesters, for the Requester Selection screen.

- **Auth:** none
- **Success — 200**
```json
[
  { "id": 1, "name": "Jennifer Anderson", "email": "jennifer.anderson@example.com" },
  { "id": 2, "name": "Michael Brown", "email": "michael.brown@example.com" }
]
```
- Inactive Requesters are never included (BR-06).
- **Failure — 500**: same shape as §1.

## 4. POST /api/tickets 🔒

Create a Ticket owned by the Requester identified in `x-requester-id`.

- **Request body**
```json
{
  "categoryId": 2,
  "relatedSystemId": 6,
  "requestedPriority": "MEDIUM",
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual even when the system is idle."
}
```
- **Validation (400 `VALIDATION_ERROR`) if:**
  - `summary` missing, or after trim not 5–150 chars (BR-14)
  - `description` missing, or after trim not 10–2000 chars (BR-15)
  - `categoryId` missing or does not reference an active Category (BR-16)
  - `relatedSystemId` missing or does not reference an active Related System (BR-17)
  - `requestedPriority` missing or not one of `LOW`/`MEDIUM`/`HIGH` (BR-18)
  - Response body includes one entry per invalid field:
```json
{
  "error": "VALIDATION_ERROR",
  "fields": {
    "summary": "Summary must be between 5 and 150 characters.",
    "categoryId": "Select a valid category."
  }
}
```
- **Success — 201**
```json
{
  "id": 101,
  "ticketNumber": "TKT-2026-000101",
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 6,
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual even when the system is idle.",
  "requestedPriority": "MEDIUM",
  "itPriority": null,
  "currentStatus": "NEW",
  "createdAt": "2026-08-22T09:14:00.000Z",
  "updatedAt": "2026-08-22T09:14:00.000Z"
}
```
- **Failure — 401 / 403**: see §0.
- **Failure — 500**: `{ "error": "INTERNAL_ERROR", "message": "Unable to create ticket." }`
  — the Ticket is not partially created; either the row is fully committed or not at all.

## 5. GET /api/tickets 🔒

Retrieve the current Requester's own Tickets with search, filter, sort, and pagination.

- **Query parameters**

| Param | Type | Default | Notes |
|---|---|---|---|
| `search` | string | — | Matches `ticketNumber` OR `summary`, case-insensitive substring (BR-09) |
| `category` | int | — | Filters by `categoryId` |
| `priority` | `LOW\|MEDIUM\|HIGH` | — | Filters by `requestedPriority` |
| `status` | `NEW\|OPEN\|IN_PROGRESS\|RESOLVED` | — | Filters by `currentStatus` |
| `sortBy` | `createdAt\|ticketNumber\|updatedAt` | `createdAt` | Invalid value falls back to default (BR-12 pattern) |
| `sortDir` | `asc\|desc` | `desc` | Invalid value falls back to `desc` |
| `page` | int ≥ 1 | `1` | Invalid/out-of-range falls back to `1` |
| `pageSize` | `10\|20\|50` | `10` | Any other value falls back to `10` |

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
      "itPriority": null,
      "currentStatus": "NEW",
      "createdAt": "2026-08-22T09:14:00.000Z",
      "updatedAt": "2026-08-22T09:14:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 42,
    "totalPages": 5
  }
}
```
- Only Tickets where `requesterId` matches the current Requester are ever returned
  (BR-08). An empty `data` array with `totalItems: 0` is a valid, successful response —
  the client distinguishes "no tickets ever" vs. "no results for these filters" based
  on whether any `search`/filter params were supplied (BR-26).
- **Failure — 401 / 403**: see §0.
- **Failure — 500**: `{ "error": "INTERNAL_ERROR", "message": "Unable to load tickets." }`

## 6. GET /api/tickets/:ticketNumber 🔒

Retrieve one Ticket owned by the current Requester, including its active and removed
Attachments.

- **Success — 200**
```json
{
  "id": 101,
  "ticketNumber": "TKT-2026-000101",
  "requesterId": 1,
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 8, "name": "Corporate Laptop" },
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual...",
  "requestedPriority": "MEDIUM",
  "itPriority": null,
  "currentStatus": "NEW",
  "createdAt": "2026-08-22T09:14:00.000Z",
  "updatedAt": "2026-08-22T09:14:00.000Z",
  "attachments": [
    {
      "id": 55,
      "originalFileName": "battery_report.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 245678,
      "uploadedAt": "2026-08-22T09:15:00.000Z",
      "isRemoved": false
    },
    {
      "id": 54,
      "originalFileName": "screenshot.png",
      "mimeType": "image/png",
      "sizeBytes": 98234,
      "uploadedAt": "2026-08-22T09:10:00.000Z",
      "isRemoved": true,
      "removedAt": "2026-08-22T09:20:00.000Z",
      "removalReason": "Uploaded the wrong screenshot."
    }
  ]
}
```
- **Not found — 404**: Ticket does not exist **or** exists but belongs to a different
  Requester (BR-27 — identical response either way, to avoid leaking existence):
  `{ "error": "NOT_FOUND", "message": "Ticket not found." }`
- **Failure — 401 / 403**: see §0.

## 7. POST /api/tickets/:ticketNumber/attachments 🔒

Upload one Attachment to a Ticket owned by the current Requester.
`Content-Type: multipart/form-data`, single field `file`.

- **Validation (400/413/422):**
  - Unsupported MIME type (not JPG/JPEG/PNG/WEBP/PDF) → `422`,
    `{ "error": "UNSUPPORTED_FILE_TYPE", "message": "Only JPG, PNG, WEBP, and PDF files are allowed." }`
  - File exceeds 5MB → `413`,
    `{ "error": "FILE_TOO_LARGE", "message": "File exceeds the 5MB limit." }`
  - Ticket already has 5 active attachments → `409`,
    `{ "error": "ATTACHMENT_LIMIT_REACHED", "message": "A ticket may have at most 5 active attachments." }`
  - No file provided → `400`, `{ "error": "VALIDATION_ERROR", "message": "No file provided." }`
- **Success — 201**
```json
{
  "id": 56,
  "ticketId": 101,
  "originalFileName": "receipt.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 130044,
  "uploadedAt": "2026-08-22T10:02:00.000Z",
  "isRemoved": false
}
```
- **Not found — 404**: Ticket not found / not owned (same as §6).
- **Failure — 500**: `{ "error": "UPLOAD_FAILED", "message": "Unable to upload attachment." }`
  — this never rolls back or affects the parent Ticket (BR-23).

## 8. GET /api/attachments/:id 🔒

Retrieve Attachment metadata (owned only — ownership determined via the parent
Ticket's `requesterId`).

- **Success — 200**: same shape as an item in §6's `attachments` array.
- **Not found — 404**: Attachment does not exist, or its parent Ticket is not owned by
  the current Requester.

## 9. GET /api/attachments/:id/download 🔒

Download the raw file bytes of an **active** Attachment.

- **Success — 200**: binary file stream, `Content-Type` matching stored `mimeType`,
  `Content-Disposition: attachment; filename="<originalFileName>"`.
- **Not found — 404**: Attachment does not exist, is not owned by the current
  Requester, **or** `isRemoved = true` (BR-21 — a removed Attachment is indistinguishable
  from a nonexistent one at this endpoint).
- **Failure — 401 / 403**: see §0.

## 10. PATCH /api/attachments/:id/remove 🔒

Soft-remove an owned, currently-active Attachment.

- **Request body**
```json
{ "reason": "Uploaded the wrong screenshot." }
```
- **Validation — 400**: `reason` missing or, after trim, shorter than 3 characters
  (BR-24): `{ "error": "VALIDATION_ERROR", "fields": { "reason": "A removal reason of at least 3 characters is required." } }`
- **Success — 200**
```json
{
  "id": 54,
  "isRemoved": true,
  "removedAt": "2026-08-22T09:20:00.000Z",
  "removalReason": "Uploaded the wrong screenshot."
}
```
- **Conflict — 409**: Attachment is already removed:
  `{ "error": "ALREADY_REMOVED", "message": "This attachment has already been removed." }`
- **Not found — 404**: Attachment does not exist or is not owned by the current
  Requester.

## 11. HTTP Status Code Summary

| Status | Meaning in this API |
|---|---|
| 200 | Successful retrieval or update |
| 201 | Ticket or Attachment created |
| 400 | Validation error (missing/malformed body fields) |
| 401 | Missing or unrecognized `x-requester-id` |
| 403 | `x-requester-id` refers to an inactive Requester |
| 404 | Resource does not exist, or exists but is not owned by the current Requester |
| 409 | Conflict (attachment limit reached, attachment already removed) |
| 413 | Uploaded file exceeds the 5MB limit |
| 422 | Uploaded file has an unsupported MIME type |
| 500 | Unexpected server error (safe, generic message — no stack traces or internals leaked) |

## 12. Error Response Shape (consistent across all endpoints)

```json
{ "error": "MACHINE_READABLE_CODE", "message": "Human-readable explanation.", "fields": { "optional": "per-field detail" } }
```

`fields` is present only for `VALIDATION_ERROR` responses; all other errors omit it.
No error response ever includes stack traces, SQL, or internal file paths.
