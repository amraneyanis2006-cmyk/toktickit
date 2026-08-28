# Lab 2 Test Plan and Results — TokTickIT Requester Ticketing MVP

## 1. Test Strategy

Testing follows Test-Driven Development against `specification.md`, `ui-spec.md`, and
`api-spec.md`: for each Issue, the tests below are written first (and confirmed to fail
for the expected reason), then the smallest correct implementation is added until they
pass. Six levels are covered:

| Level | Tool | Location |
|---|---|---|
| Unit | Vitest | `server/tests/lab-02/*.unit.test.ts` |
| API / Integration | Vitest + Supertest | `server/tests/lab-02/*.api.test.ts` |
| UI Component | Vitest + Testing Library | `client/tests/lab-02/*.test.tsx` |
| UI Style / Visual | Playwright (screenshots) | `e2e/lab-02/visual/*.spec.ts` |
| Responsive | Playwright (viewport matrix) | `e2e/lab-02/responsive/*.spec.ts` |
| End-to-End | Playwright | `e2e/lab-02/*.spec.ts` |

No planned test may be skipped, disabled, or `.only`-marked in the final `main` branch
(Definition of Done, `specification.md` §10).

## 2. Planned Tests

### 2.1 Unit Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-01 | Ticket Number generator format | Returns `TKT-{YYYY}-{6 digits}`, zero-padded | `server/tests/lab-02/ticket-number.unit.test.ts` | Pending |
| UNIT-02 | Unit | BR-01 | Ticket Number uniqueness under sequential calls | Two consecutive generations never collide | `server/tests/lab-02/ticket-number.unit.test.ts` | Pending |
| UNIT-03 | Unit | BR-14/BR-15 | Summary/Description trim + length validator | Rejects <5 / >150 chars (summary), <10 / >2000 chars (description); trims whitespace before checking | `server/tests/lab-02/ticket-validation.unit.test.ts` | Pending |
| UNIT-04 | Unit | BR-20 | Attachment MIME/size validator | Accepts JPG/JPEG/PNG/WEBP/PDF ≤5MB; rejects all else | `server/tests/lab-02/attachment-validation.unit.test.ts` | Pending |
| UNIT-05 | Unit | BR-12 | Pagination parameter normalizer | Invalid `page`/`pageSize` fall back to `1`/`10`; valid `pageSize` of 20/50 pass through | `server/tests/lab-02/pagination.unit.test.ts` | Pending |

### 2.2 API / Integration Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-01 | API | AC-01, BR-01, BR-02 | `POST /api/tickets` with valid body | 201; response includes generated `ticketNumber`; `currentStatus` is `NEW` | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-02 | API | AC-04, BR-14 | `POST /api/tickets` missing Summary | 400 `VALIDATION_ERROR` with `fields.summary`; no row inserted | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-03 | API | BR-15 | `POST /api/tickets` Description too short | 400 `VALIDATION_ERROR` with `fields.description` | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-04 | API | BR-16/BR-17 | `POST /api/tickets` with non-existent `categoryId`/`relatedSystemId` | 400 `VALIDATION_ERROR` | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-05 | API | §0 | `POST /api/tickets` missing `x-requester-id` header | 401 `MISSING_REQUESTER` | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-06 | API | BR-25 | `POST /api/tickets` with inactive Requester's id | 403 `REQUESTER_INACTIVE`; no Ticket created | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-07 | API | AC-08, BR-08 | `GET /api/tickets` scoping | Returns only Tickets where `requesterId` matches header; switching header changes result set | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-08 | API | BR-09 | `GET /api/tickets?search=` | Case-insensitive partial match on ticketNumber OR summary | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-09 | API | BR-10 | `GET /api/tickets?category=&priority=&status=` | Filters combine with AND semantics; unmatched filter returns empty `data` | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-10 | API | BR-11 | `GET /api/tickets` default sort | Results ordered `createdAt desc`, ties broken by `ticketNumber desc` | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-11 | API | AC-11, BR-12 | `GET /api/tickets?page=2&pageSize=10` | Returns correct slice; `pagination.totalPages` matches total count | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-12 | API | BR-12 | `GET /api/tickets?page=-1&pageSize=999` | Falls back to `page=1`, `pageSize=10` rather than erroring | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-13 | API | AC-03, BR-08, BR-27 | `GET /api/tickets/:ticketNumber` for a Ticket owned by a different Requester | 404 `NOT_FOUND` (not 403) | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-14 | API | AC-13 | `GET /api/tickets/:ticketNumber` for own Ticket | 200 with full detail + `attachments` array including removed ones as metadata | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-15 | API | AC-05, BR-20 | `POST /api/tickets/:ticketNumber/attachments` with 6MB file | 413 `FILE_TOO_LARGE`; no row inserted | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-16 | API | BR-20 | `POST .../attachments` with `.exe` file | 422 `UNSUPPORTED_FILE_TYPE` | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-17 | API | AC-06, BR-20 | `POST .../attachments` on a Ticket already at 5 active attachments | 409 `ATTACHMENT_LIMIT_REACHED` | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-18 | API | BR-22 | `POST .../attachments` on a Ticket owned by a different Requester | 404 `NOT_FOUND` | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-19 | API | AC-12, BR-21, BR-24 | `PATCH /api/attachments/:id/remove` with valid reason | 200; `isRemoved: true`, `removedAt` and `removalReason` set | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-20 | API | BR-24 | `PATCH .../remove` with reason `"ok"` (2 chars) | 400 `VALIDATION_ERROR` on `fields.reason` | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-21 | API | — | `PATCH .../remove` on an already-removed Attachment | 409 `ALREADY_REMOVED` | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-22 | API | AC-13, BR-21 | `GET /api/attachments/:id/download` on a removed Attachment | 404 `NOT_FOUND` (file not served) | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-23 | API | BR-06, AC-15 | `GET /api/requesters` with one inactive seeded Requester | Response excludes the inactive Requester | `server/tests/lab-02/requesters.api.test.ts` | Pending |
| API-24 | API | — | `GET /api/categories`, `GET /api/related-systems` | Return only active reference rows, seeded set present | `server/tests/lab-02/reference-data.api.test.ts` | Pending |

### 2.3 UI Component Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UI-01 | UI | FR-01 | Requester Selection renders active Requesters | Dropdown options match mocked API response; inactive Requester absent | `client/tests/lab-02/RequesterSelection.test.tsx` | Pending |
| UI-02 | UI | FR-01 | Requester Selection loading state | Shows skeleton/spinner while API is pending | `client/tests/lab-02/RequesterSelection.test.tsx` | Pending |
| UI-03 | UI | FR-01 | Requester Selection empty state | Shows "no active development requesters" message when API returns `[]` | `client/tests/lab-02/RequesterSelection.test.tsx` | Pending |
| UI-04 | UI | AC-04, BR-19 | Create Ticket submit without Summary | Field-level error message shown under Summary; `fetch`/API mock not called | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-05 | UI | BR-13 | Create Ticket submit button busy state | Button disabled + shows "Submitting…" while request is in flight | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-06 | UI | AC-01 | Create Ticket success state | Displays returned Ticket Number after a mocked 201 response | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-07 | UI | AC-07, BR-19 | Create Ticket API failure | Error banner shown; all entered field values remain in the form | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-08 | UI | AC-05 | Create Ticket oversized attachment | Client-side rejects a mocked 6MB file before upload, shows inline error | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-09 | UI | AC-09/AC-10 | My Tickets empty vs. no-results | Renders distinct copy/CTA for zero-tickets-ever vs. filtered-to-zero | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-10 | UI | AC-11 | My Tickets pagination controls | Clicking "Next" requests `page=2`; page indicator updates | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-11 | UI | BR-09/BR-10 | My Tickets search + filter interaction | Typing in search and choosing a filter both trigger a re-fetch with correct query params | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-12 | UI | AC-12 | Ticket Detail remove attachment flow | Falls back to `page=1`, `pageSize=10` rather than erroring (pageSize valid range is 1–100) | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pending |
| UI-13 | UI | BR-05 | Ticket Detail IT Priority display | Renders "Not set" when `itPriority` is `null` | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pending |
| UI-14 | UI | FR-12/AC-06 | Attachment section enforces 5-file cap in the UI | "Add Attachment" control disables / shows message at 5 active attachments | `client/tests/lab-02/AttachmentSection.test.tsx` | Pending |

### 2.4 Responsive & Visual Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| RESP-01 | Responsive | AC-14 | My Tickets at 375px width | Renders as stacked cards, no horizontal scrollbar | `e2e/lab-02/responsive/my-tickets.spec.ts` | Pending |
| RESP-02 | Responsive | §8.7 | Create Ticket at 375px / 800px / 1280px | Fields stack single-column on mobile, 2-column on tablet, full layout on desktop; no clipped labels | `e2e/lab-02/responsive/create-ticket.spec.ts` | Pending |
| RESP-03 | Responsive | §8.7 | Ticket Detail at 375px | Attachment rows remain usable (no overflow); action buttons remain tappable (≥44px) | `e2e/lab-02/responsive/ticket-detail.spec.ts` | Pending |
| VIS-01 | Visual | §7, §9 (ui-spec) | Zen Green token conformance screenshot diff | Header, buttons, badges match approved color tokens (manual checklist + screenshot archive) | `e2e/lab-02/visual/zen-green-tokens.spec.ts` | Pending |
| VIS-02 | Visual | §5 (ui-spec) | Badge consistency across screens | Priority/Status badges render identically in My Tickets and Ticket Detail | `e2e/lab-02/visual/badges.spec.ts` | Pending |

### 2.5 End-to-End Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| E2E-01 | E2E | AC-01, AC-14 | Full responsive ticket creation flow | Select Requester → Create Ticket (valid data + 1 attachment) → confirmation shows official Ticket Number, at desktop and mobile viewports | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| E2E-02 | E2E | AC-08 | Cross-Requester isolation | Create a Ticket as Requester A, switch to Requester B, confirm A's Ticket is absent from B's My Tickets and returns 404 if navigated to directly | `e2e/lab-02/requester-isolation.spec.ts` | Pending |
| E2E-03 | E2E | AC-12, AC-13 | Attachment lifecycle | Add an attachment to an existing Ticket, download it, soft-remove it with a reason, confirm it becomes non-downloadable and shows as removed metadata | `e2e/lab-02/attachment-lifecycle.spec.ts` | Pending |
| E2E-04 | E2E | AC-09, AC-10, AC-11 | My Tickets search/filter/pagination | Seed >10 Tickets, verify empty state pre-seed, search narrows results, filters combine, pagination pages through results | `e2e/lab-02/my-tickets-query.spec.ts` | Pending |
| E2E-05 | E2E | AC-15 | Inactive Requester exclusion | Confirm the seeded inactive Requester never appears in the selection dropdown | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |

## 3. Acceptance-Criterion Traceability

| AC | Covered By |
|---|---|
| AC-01 | API-01, UI-06, E2E-01 |
| AC-02 | (routing guard — see Known Limitations) |
| AC-03 | API-13 |
| AC-04 | API-02, UI-04 |
| AC-05 | API-15, UI-08 |
| AC-06 | API-17, UI-14 |
| AC-07 | UI-07 |
| AC-08 | API-07, E2E-02 |
| AC-09 | UI-09, E2E-04 |
| AC-10 | UI-09, E2E-04 |
| AC-11 | API-11, API-12, UI-10, E2E-04 |
| AC-12 | API-19, UI-12, E2E-03 |
| AC-13 | API-22, E2E-03 |
| AC-14 | RESP-01 |
| AC-15 | API-23, E2E-05 |

Every Acceptance Criterion maps to at least one automated test, per the requirement in
`specification.md` §9 / labsheet §9.2.

## 4. Responsive and Visual Checklist

See `ui-spec.md` §9 for the full manual checklist (colors, field states, required-field
markers, button hierarchy, clipping/overlap, badge consistency). This checklist is
completed once per screenshot round (RESP-01/02/03, VIS-01/02) and archived under
`artifacts/lab-02/screenshots/`.

## 5. Test Commands

```bash
# Backend unit + API tests
cd server && npx vitest run

# Frontend component tests
cd client && npx vitest run

# End-to-end + responsive + visual tests (Playwright)
npx playwright test e2e/lab-02
```

All three commands must exit with zero failures on the final `main` branch before the
Lab 2 Definition of Done can be considered satisfied.

## 6. Final Results

_To be filled in once implementation is complete — paste final `vitest run` and
`playwright test` summary output here (test file counts, pass counts, duration), and
update every "Final" column above to `Pass`._

## 7. Known Limitations or Deferred Tests

- **AC-02** ("no Requester selected → redirected to Selection screen") is enforced by a
  client-side route guard rather than a testable API behavior; it will be covered by a
  dedicated `client/tests/lab-02/RouteGuard.test.tsx` component test asserting the
  guard redirects when no Requester is in context — added once the routing
  implementation for the shell is in place.
- Visual regression (VIS-01/VIS-02) is checklist + screenshot-archive based rather than
  pixel-diffed against a golden image, consistent with the labsheet's "visual
  inspection" wording in §8.8 rather than a strict CI visual-regression gate.
