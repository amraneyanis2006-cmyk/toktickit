# Lab 4 Test Plan — TokTickIT Actions Taken, Ticket Workflow, Dashboards, Final Regression

Planned before implementation (Spec DD → Test DD → TDD). Every AC in
`docs/lab-04/specification.md` §9 maps to at least one planned test (§12).

**Binding rules for the coding agent**
1. The file path in the "Automated Test File" column is binding. If a test must live
   elsewhere, `tests.md` is updated **in the same PR**.
2. Every automated test name starts with its Test ID, e.g.
   `it('API-03: creates a valid Action Taken under the correct Ticket and actor', …)`,
   so the final logs prove the traceability.
3. "Final" is updated only from the real output of the final `main` branch
   (`npm run test`, `npm run test:e2e`), never back-filled.

## 1. Unit Tests (server)

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-08 | Action Taken status transition function | True only for PLANNED→IN_PROGRESS/COMPLETED/CANCELLED and IN_PROGRESS→COMPLETED/CANCELLED; terminal states have no exit | server/tests/lab-04/unit/actionTransition.unit.test.ts | Planned |
| UNIT-02 | Unit | BR-12 | `computeResolutionGate(ticket, actions)` | Blockers UNASSIGNED / NO_COMPLETED_ACTION / OPEN_ACTIONS exactly when they apply; `canResolve` only when none | server/tests/lab-04/unit/resolutionGate.unit.test.ts | Planned |
| UNIT-03 | Unit | BR-06, BR-07 | Action Taken field validation | Trims; rejects empty/too long description, missing follow-up note when required, date before ticket or > now+5 min; returns every field error | server/tests/lab-04/unit/actionValidation.unit.test.ts | Planned |
| UNIT-04 | Unit | BR-22, BR-23 | Dashboard constants and window | Active status list is exactly the 5 values; window start = now − 7×24 h independent of TZ | server/tests/lab-04/unit/dashboardWindow.unit.test.ts | Planned |
| UNIT-05 | Unit | API §7 | Comma-separated status filter parser | Parses one or many statuses, de-duplicates, rejects any unknown value (single or in a comma-separated list) with a `fields.status` error | server/tests/lab-04/unit/statusFilter.unit.test.ts | Planned |

## 2. API / Integration Tests — Actions Taken

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-01 | API | FR-01, BR-19 | List Actions Taken | Ordered by actionAt asc then id asc; same order on every call | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-02 | API | BR-06, BR-07 | Create with invalid fields | 400 VALIDATION_ERROR with every invalid field; nothing saved | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-03 | API | AC-01 | Create a valid Action Taken | 201; saved under the correct Ticket; createdBy = session user; performedBy = creator by default or the given active assignee; status PLANNED | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-04 | API | AC-03, BR-05 | Assign to inactive IT Staff / to a Requester (create and edit) | 422 INVALID_ASSIGNEE; nothing saved/changed | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-05 | API | AC-04 | Follow-Up Required without note | 400 with `fields.followUpNote`; with note → 201; note stored null when not required | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-06 | API | BR-01, BR-04 | Client-supplied `createdById` / `ticketId` | Ignored; server values used | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-07 | API | FR-03, FR-04 | Edit and re-assign an open action | 200; only supplied fields change; updatedAt changes | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-08 | API | AC-06 | Complete without / with Result, then edit | 400 `fields.result`; then 200 COMPLETED with completedAt; later PATCH → 409 ACTION_LOCKED | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-09 | API | AC-07 | Cancel an action | 200 CANCELLED with cancelledAt; still returned by the list; edit → 409 ACTION_LOCKED | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-10 | API | BR-08, BR-09 | Status changes on terminal actions and illegal open-state moves | COMPLETED/CANCELLED → any status: 409 ACTION_LOCKED (checked first); IN_PROGRESS→PLANNED, IN_PROGRESS→IN_PROGRESS, PLANNED→PLANNED: 409 INVALID_ACTION_TRANSITION; unknown status: 400 | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-11 | API | AC-11, BR-17 | Stale `expectedUpdatedAt` | 409 STALE_UPDATE with `current`; first user's change kept; missing token → 400 | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-12 | API | AC-13, BR-18 | Same `clientRequestId` twice (sequential and parallel); same key with a different payload | One row; same payload → 200 with the original, unchanged; different `actionAt`/`description`/`result`/`followUpRequired`/`followUpNote`/`attachmentNotes`/`performedById` → 409 IDEMPOTENCY_KEY_REUSED with `current`, nothing saved | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-13 | API | BR-10 | Create/edit on RESOLVED, CLOSED, CANCELLED Ticket | 409 TICKET_NOT_ACTIVE | server/tests/lab-04/actions-taken.api.test.ts | Planned |
| API-14 | API | AC-15, BR-09 | Append-only | DELETE on action → 404 (no route); count unchanged; order stable after an edit | server/tests/lab-04/actions-taken.api.test.ts | Planned |

## 3. API / Integration Tests — Ticket Workflow

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| WF-01 | Workflow | AC-08 | Resolve with no completed action | 409 RESOLUTION_BLOCKED, blockers [NO_COMPLETED_ACTION]; status unchanged | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| WF-02 | Workflow | AC-08 | Resolve with an open action (direct API call, no UI); resolve racing an action create | 409 RESOLUTION_BLOCKED, blockers [OPEN_ACTIONS]; status unchanged; an action created during a resolve is seen by the gate, and a create after a committed resolve gets 409 TICKET_NOT_ACTIVE (row-lock interleaving forced by the test) | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| WF-03 | Workflow | AC-09, BR-15, BR-16 | Resolve when the gate is met | 200 RESOLVED; resolvedAt set; exactly one history row; legalNextStatuses [CLOSED, REOPENED] | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| WF-04 | Workflow | AC-10, BR-11 | Every pair not in the matrix | 409 INVALID_TRANSITION, status unchanged (all 8×8 pairs checked) | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| WF-05 | Workflow | AC-12, BR-17 | Stale and concurrent status changes | Stale expectedUpdatedAt → 409 STALE_UPDATE with `current` (checked before the matrix); status changed between read and write → 409 STALE_UPDATE (conditional update, 0 rows); with a token, any update in that window → 409 STALE_UPDATE; two parallel transitions → one 200 and one 409, one history row; invalid `currentStatus`/`expectedUpdatedAt` → 400 with both `fields` | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| WF-06 | Workflow | BR-14, BR-15, BR-16 | Close / reopen | CLOSED keeps resolvedAt; REOPENED clears resolvedAt and requesterIndicatedResolved; a history row per change | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| WF-07 | Workflow | AC-14 | Requester "Problem Appears Resolved" | Status unchanged; staff detail shows requesterIndicatedResolved = true | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| WF-08 | Workflow | AC-15, BR-19, BR-20 | Role-appropriate visibility and ordering | Requester detail has actionsTaken + statusHistory (ordered) and no `internalNotes` key; staff detail has all plus resolutionGate | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |
| WF-09 | Workflow | BR-13 | Cancel a Ticket without actions; action writes racing a cancel | 200 CANCELLED; CANCELLED is terminal; an action edit or status change racing the cancel gets 409 TICKET_NOT_ACTIVE and changes nothing | server/tests/lab-04/ticket-workflow.api.test.ts | Planned |

## 4. API / Integration Tests — Dashboards

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| DASH-01 | API | AC-02, BR-24 | Requester dashboard scope | Two Requesters get only their own counts and tickets; a `requesterId` query param is ignored | server/tests/lab-04/requester-dashboard.api.test.ts | Planned |
| DASH-02 | API | AC-16, BR-21 | Requester metrics vs SQL | Each metric equals the same count run with `prisma.$queryRaw` | server/tests/lab-04/requester-dashboard.api.test.ts | Planned |
| DASH-03 | API | AC-18, BR-25 | Requester with no Tickets | All values 0, lists [] , status 200 | server/tests/lab-04/requester-dashboard.api.test.ts | Planned |
| DASH-04 | API | BR-23 | 7-day window boundary | resolvedAt 6 days ago counted, 8 days ago not | server/tests/lab-04/requester-dashboard.api.test.ts | Planned |
| DASH-05 | API | AC-17, BR-26 | Requester drill-down equality | GET /api/tickets with each drillDown query → totalItems = metric value | server/tests/lab-04/requester-dashboard.api.test.ts | Planned |
| DASH-06 | API | AC-19 | Requester dashboard authorization | IT Staff/Admin → 403; no session → 401 | server/tests/lab-04/requester-dashboard.api.test.ts | Planned |
| DASH-07 | API | AC-16, BR-21 | Staff metrics vs SQL | Every metric, all byStatus and byItPriority keys equal raw SQL counts | server/tests/lab-04/staff-dashboard.api.test.ts | Planned |
| DASH-08 | API | AC-17, BR-26 | Staff drill-down equality | GET /api/staff/tickets with each drillDown query → totalItems = metric value | server/tests/lab-04/staff-dashboard.api.test.ts | Planned |
| DASH-09 | API | AC-19, BR-27 | Staff dashboard authorization | Requester → 403; no session → 401; IT Staff has no userAccounts; Admin has userAccounts equal to SQL | server/tests/lab-04/staff-dashboard.api.test.ts | Planned |
| DASH-10 | API | AC-18 | Staff member with no open actions | myOpenActions 0 and [] | server/tests/lab-04/staff-dashboard.api.test.ts | Planned |
| DASH-11 | API | §5.2 table | Lists | ≤ 5 items, documented order, only documented fields | server/tests/lab-04/staff-dashboard.api.test.ts | Planned |
| DASH-12 | API | AC-14 | awaitingReview | Counts active Tickets with requesterIndicatedResolved = true only | server/tests/lab-04/staff-dashboard.api.test.ts | Planned |

## 5. Security / Authorization Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| SEC-01 | Security | AC-05, BR-03 | Requester calls every Action Taken write endpoint and the status endpoint | 403 FORBIDDEN each time; database unchanged | server/tests/lab-04/security.api.test.ts | Planned |
| SEC-02 | Security | AC-05, BR-20 | Requester reads tickets | Own ticket: actions read-only, no internalNotes; other Requester's ticket → 404 | server/tests/lab-04/security.api.test.ts | Planned |
| SEC-03 | Security | api-spec §0 | Every new endpoint without a session | 401 NOT_AUTHENTICATED | server/tests/lab-04/security.api.test.ts | Planned |
| SEC-04 | Security | Lab 3 BR-03 | Password-change gate on new endpoints | 403 PASSWORD_CHANGE_REQUIRED | server/tests/lab-04/security.api.test.ts | Planned |
| SEC-05 | Security | FR-20 | Malformed ids and payloads | Non-numeric/unknown actionId → 404, wrong types → 400; unknown `status` filter value (single or comma-separated) on `GET /api/tickets` and `GET /api/staff/tickets` → 400 VALIDATION_ERROR with `fields.status`; never 500, no stack trace | server/tests/lab-04/security.api.test.ts | Planned |

## 6. Migration / Regression Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| MIG-01 | Migration | AC-20 | Lab 4 migration SQL is additive | Contains no DROP/DELETE/ALTER … TYPE on Lab 1–3 objects | server/tests/lab-04/migration.api.test.ts | Planned |
| MIG-02 | Migration | AC-20, spec §7.1 | `resolvedAt` backfill | Legacy RESOLVED/CLOSED ticket with null resolvedAt gets updatedAt; active tickets untouched; re-running is a no-op | server/tests/lab-04/migration.api.test.ts | Planned |
| MIG-03 | Migration | AC-20 | Lab 1–3 data still valid | Users, Tickets, Attachments, Comments, Notes readable through their Lab 3 endpoints; legacy tickets have actionsTaken [] and statusHistory [] | server/tests/lab-04/migration.api.test.ts | Planned |
| MIG-04 | Migration | §7.2 | Seed idempotency | Running the seed twice leaves every table count unchanged | server/tests/lab-04/migration.api.test.ts | Planned |
| REG-01 | Regression | AC-21 | All Lab 1–3 server suites | Pass (only the CHG-02 fixture change, incl. its teardown of fixture actions and history rows) | server/tests/lab-01/, server/tests/lab-02/, server/tests/lab-03/ | Planned |
| REG-02 | Regression | AC-21 | All Lab 2–3 client suites | Pass | client/tests/lab-02/, client/tests/lab-03/ | Planned |
| REG-03 | Regression | AC-21 | All Lab 2–3 Playwright specs | Pass; only CHG-01 changes: either the post-login landing-URL assertion is updated or exactly one navigation step (`page.goto` or a nav click) is added right after login; nothing else changes | e2e/lab-02/, e2e/lab-03/ | Planned |

## 7. Performance Smoke Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| PERF-01 | Performance | AC-25 | Requester dashboard, 10 calls | p95 < 500 ms | server/tests/lab-04/performance.smoke.test.ts | Planned |
| PERF-02 | Performance | AC-25 | Staff dashboard (Admin), 10 calls | p95 < 500 ms | server/tests/lab-04/performance.smoke.test.ts | Planned |
| PERF-03 | Performance | FR-01 | Staff Ticket Detail with 25 actions | < 500 ms | server/tests/lab-04/performance.smoke.test.ts | Planned |
| PERF-04 | Smoke | FR-24 | `GET /api/health` and `GET /api/health/db` | `/api/health` 200 `{status:"ok", service:"TokTickIT API"}` (unchanged); `/api/health/db` 200 `{database:"ok"}` | server/tests/lab-04/performance.smoke.test.ts | Planned |

## 8. UI Component Tests (client)

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UI-01 | Component | FR-14, FR-15, FR-18, AC-18 | StaffDashboard | Renders API values, "View all" links with accessible names and drill-down hrefs, User Accounts only for Admin, loading/empty/failure+Retry states | client/tests/lab-04/StaffDashboard.test.tsx | Planned |
| UI-02 | Component | FR-13, AC-18, AC-24 | RequesterDashboard | 4 cards, attention + recent lists, empty texts, failure + Retry | client/tests/lab-04/RequesterDashboard.test.tsx | Planned |
| UI-03 | Component | FR-02–FR-06, AC-04, AC-13 | ActionsTaken | Ordered list; create validation (follow-up note); Save busy-disabled; same clientRequestId reused on retry; Complete asks for Result; Cancel opens confirm dialog; locked rows read-only; STALE_UPDATE and INVALID_ASSIGNEE messages; Requester read-only variant has no buttons | client/tests/lab-04/ActionsTaken.test.tsx | Planned |
| UI-04 | Component | FR-07–FR-12 | TicketWorkflow (Operational Panel status control + history) | Only legal targets; Resolved disabled with reason; RESOLUTION_BLOCKED message; success refreshes badge, resolvedAt, history; awaiting-review banner | client/tests/lab-04/TicketWorkflow.test.tsx | Planned |
| UI-05 | Component | FR-16, BR-26 | Drill-down filters | MyTickets and StaffTicketQueue initialise filters from the URL, show the chip, Clear removes it | client/tests/lab-04/DrillDown.test.tsx | Planned |

## 9. UI Style / Visual Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| STYLE-01 | UI Style | ui-spec §1 | Action status, Follow-up, Awaiting-review badges | Use the token pairs of ui-spec §1, pill shape, always a text label | client/tests/lab-04/actionBadges.style.test.tsx | Planned |
| STYLE-02 | UI Style | ui-spec §3, §6 | Metric cards and Action panel fields | `zg-card zg-metric` structure; locked fields use `zg-readonly-field`; errors use `zg-field-error` under the field | client/tests/lab-04/dashboardCards.style.test.tsx | Planned |

## 10. End-to-End, Responsive, Accessibility, Safe-Failure Tests (Playwright)

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| E2E-01 | E2E | AC-23, FR-17 | Login for Requester, IT Staff, Admin | Each lands on /dashboard with "Dashboard" active | e2e/lab-04/dashboards.spec.ts | Planned |
| E2E-02 | E2E | AC-03 | Assign an action to a staff member deactivated meanwhile | Error under Performed by; nothing saved | e2e/lab-04/actions-taken-flow.spec.ts | Planned |
| E2E-03 | E2E | AC-01, AC-06, AC-07 | Full action lifecycle on one Ticket | Create 3 actions; start + complete one (with result), cancel one, edit one; all shown in order with correct badges | e2e/lab-04/actions-taken-flow.spec.ts | Planned |
| E2E-04 | E2E | AC-08, AC-09 | Resolution through the UI | Resolved disabled with reason → complete actions → resolve; badge, resolved date, history refresh; Requester sees the history and actions | e2e/lab-04/ticket-resolution.spec.ts | Planned |
| E2E-05 | E2E | AC-14 | Requester says resolved → staff review | Staff sees banner and the Awaiting Review count; status unchanged until staff resolve | e2e/lab-04/ticket-resolution.spec.ts | Planned |
| E2E-06 | E2E | AC-17 | Dashboard drill-down | Clicking each card's "View all" shows a list whose total equals the card value | e2e/lab-04/dashboards.spec.ts | Planned |
| E2E-07 | E2E | AC-02, AC-18 | Requester dashboards | Fixture Requester sees only own data; Requester with no tickets sees empty states | e2e/lab-04/dashboards.spec.ts | Planned |
| E2E-08 | E2E | AC-21, FR-19 | Final regression across roles | Login/logout, My Tickets search, Create Ticket, attachment add/remove, Public Comment, Queue, Claim, Internal Note, User Management search | e2e/lab-04/regression.spec.ts | Planned |
| E2E-09 | E2E | AC-11 | Stale edit in two browser contexts | Second save shows the conflict message and the latest values | e2e/lab-04/actions-taken-flow.spec.ts | Planned |
| RESP-01 | Responsive | AC-22 | Dashboards at 320/768/1280 | `scrollWidth ≤ clientWidth`; cards 1/2/4–5 per row; nothing clipped | e2e/lab-04/dashboards.spec.ts | Planned |
| RESP-02 | Responsive | AC-22 | Actions Taken at 320/768/1280 | Table at 1280, cards at 768 and 320; no horizontal overflow | e2e/lab-04/actions-taken-flow.spec.ts | Planned |
| A11Y-01 | Accessibility | ui-spec §9 | Keyboard-only action create/complete/cancel | Reachable by Tab, visible focus, dialog traps focus, Esc closes and returns focus | e2e/lab-04/actions-taken-flow.spec.ts | Planned |
| A11Y-02 | Accessibility | ui-spec §9 | Dashboard semantics | One h1, card h2, links with metric names, `aria-current` on Dashboard | e2e/lab-04/dashboards.spec.ts | Planned |
| FAIL-01 | Safe Failure | AC-24, FR-18 | Dashboard API failure (route aborted) | Safe message + Retry; Retry recovers | e2e/lab-04/dashboards.spec.ts | Planned |
| FAIL-02 | Safe Failure | AC-24, FR-22 | Action save network failure | Message shown; typed values preserved; second Save creates exactly one action | e2e/lab-04/actions-taken-flow.spec.ts | Planned |
| SHOT-01 | Evidence | ui-spec §10 | Screenshot generation | Writes every checklist screenshot at 1280/768/320 into artifacts/lab-04/screenshots/ | e2e/lab-04/screenshots.spec.ts | Planned |

## 11. Evidence Script (not a test)

`scripts/lab4-metrics-check.ts` — logs in as a chosen Requester, IT Staff, and
Administrator, calls both dashboard endpoints, runs the equivalent raw SQL for every
metric, and prints a table `metric | API | SQL | match`; output saved to
`artifacts/lab-04/metrics-check.txt` (Answer Part 5).

## 12. Acceptance-Criterion Traceability

| AC | Planned tests |
|---|---|
| AC-01 | API-03, E2E-03 |
| AC-02 | DASH-01, E2E-07 |
| AC-03 | API-04, E2E-02 |
| AC-04 | API-05, UI-03 |
| AC-05 | SEC-01, SEC-02 |
| AC-06 | API-08, E2E-03 |
| AC-07 | API-09, E2E-03 |
| AC-08 | WF-01, WF-02, E2E-04 |
| AC-09 | WF-03, E2E-04 |
| AC-10 | WF-04 |
| AC-11 | API-11, E2E-09 |
| AC-12 | WF-05 |
| AC-13 | API-12, UI-03 |
| AC-14 | WF-07, DASH-12, E2E-05 |
| AC-15 | API-14, WF-08 |
| AC-16 | DASH-02, DASH-07 (+ metrics-check evidence) |
| AC-17 | DASH-05, DASH-08, E2E-06 |
| AC-18 | DASH-03, DASH-10, UI-01, UI-02, E2E-07 |
| AC-19 | DASH-06, DASH-09 |
| AC-20 | MIG-01, MIG-02, MIG-03, MIG-04 |
| AC-21 | REG-01, REG-02, REG-03, E2E-08 |
| AC-22 | RESP-01, RESP-02 |
| AC-23 | E2E-01 |
| AC-24 | FAIL-01, FAIL-02, UI-02 |
| AC-25 | PERF-01, PERF-02 |

## 13. Test Commands

```bash
npm run test                                   # server (Vitest + Supertest) + client (Vitest + Testing Library)
(cd server && npx vitest run tests/lab-04)     # Lab 4 server tests only
(cd client && npx vitest run tests/lab-04)     # Lab 4 client tests only
npm run dev                                    # in another terminal, then:
npx playwright test e2e/lab-04                 # Lab 4 E2E, responsive, a11y, safe failure, screenshots
npm run test:e2e                               # complete Labs 2–4 Playwright suite
npx tsx scripts/lab4-metrics-check.ts > artifacts/lab-04/metrics-check.txt
```

**Server test timeout:** from Issue #61 the server Vitest config sets
`testTimeout: 15000` (config only, no test edited). The bcrypt cost-12 Lab 3 API tests
(e.g. `users-admin.api.test.ts` reset-password, about 5.1 s) exceed the 5 s default on a
loaded machine. It also sets `fileParallelism: false` (PR #69 review): the server
files share one dev database and CPU-bound bcrypt, so they run one file at a time and
`npx vitest run` is deterministic.
The client Vitest config (`client/vite.config.ts`) sets `testTimeout: 15000` and
`maxWorkers: 2` (Issue #62), so `cd client && npx vitest run` passes in one normal run.

## 14. Final Results

To be filled from the final run on `main` (commit, date, totals per suite, zero
failed/skipped).
