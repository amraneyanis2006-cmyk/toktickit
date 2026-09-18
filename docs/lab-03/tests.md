# Lab 3 Test Plan — TokTickIT Authentication, Roles, IT Staff Ticketing, and Admin User Management

Planned before/alongside implementation, per handout §10. Every AC in
`docs/lab-03/specification.md` §9 maps to at least one test below.

## 1. Unit Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-04 | Password hashing helper | Hash differs from plaintext, verify() round-trips | server/tests/lab-03/unit/password.unit.test.ts | Pass |
| UNIT-02 | Unit | BR-14/§4.7 | Status transition matrix lookup function | Returns true only for listed pairs | server/tests/lab-03/unit/statusTransition.unit.test.ts | Pass |
| UNIT-03 | Unit | BR-23 | Initial password generator | Produces a random ≥12-char string, never deterministic across calls | server/tests/lab-03/unit/initialPassword.unit.test.ts | Pass |
| UNIT-04 | Unit | BR-19 | Email normalization/uniqueness comparator | Case-insensitive duplicate detection | server/tests/lab-03/unit/email.unit.test.ts | Pass |

## 2. API / Integration Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | File | Final |
|---|---|---|---|---|---|---|
| API-01 | API | AC-01 | Valid login | Authenticated response; safe user data; session cookie set | server/tests/lab-03/auth.api.test.ts | Pass |
| API-02 | API | AC-05 | Invalid login (bad password) | 401 INVALID_CREDENTIALS, generic message | server/tests/lab-03/auth.api.test.ts | Pass |
| API-03 | API | AC-05 | Login for inactive account | 401 INVALID_CREDENTIALS, identical message to API-02 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-04 | API | AC-05 | Login for unknown email | 401 INVALID_CREDENTIALS, identical message to API-02/03 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-05 | API | AC-02 | mustChangePassword gates other endpoints | 403 PASSWORD_CHANGE_REQUIRED on e.g. GET /api/tickets until changed | server/tests/lab-03/auth.api.test.ts | Pass |
| API-06 | API | AC-02 | Change password success | mustChangePassword becomes false; subsequent requests succeed | server/tests/lab-03/auth.api.test.ts | Pass |
| API-07 | API | BR-05 | Change password validation | Rejects <8 chars and newPassword == currentPassword | server/tests/lab-03/auth.api.test.ts | Pass |
| API-08 | API | AC-06 | Logout | Session invalidated; subsequent request with old cookie is 401 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-09 | API | BR-06 | Session expiry | Request after simulated 8h inactivity returns 401 | server/tests/lab-03/auth.api.test.ts | Pass |
| API-10 | API | AC-03 | Requester ownership via session, not client input | Ticket list/detail scoped to session.userId regardless of any client-supplied id | server/tests/lab-03/authorization.api.test.ts | Pass |
| API-11 | API | AC-15 | Migrated Lab 2 Requester regression | Existing migrated Requester logs in and sees their pre-migration tickets unchanged | server/tests/lab-03/migration.api.test.ts | Pass |
| API-12 | API | FR-07 | All Lab 2 ticket endpoints post-migration | Create/list/search/filter/sort/paginate/detail/attachment add/remove all pass with session auth | server/tests/lab-03/requester-regression.api.test.ts | Pass |
| API-13 | API | AC-10 | Post Public Comment as Requester | 201, visible to IT Staff on the same ticket | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-14 | API | FR-15 | Post Public Comment as IT Staff | 201, visible to Requester | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-15 | API | BR-15 | Comment/Note validation | Empty/whitespace-only and >2000 chars rejected (both comment and note endpoints) | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-16 | API | AC-04 | Requester requests Internal Notes | 403 FORBIDDEN; no note data returned | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-17 | API | AC-09 | Staff Ticket Detail includes Internal Notes; Requester detail never does | Requester-facing ticket response has no internalNotes field/content | server/tests/lab-03/comments-notes.api.test.ts | Pass |
| API-18 | API | FR-09 | Problem Appears Resolved | PATCH sets requesterIndicatedResolved=true; currentStatus unchanged; non-owner rejected 404 | server/tests/lab-03/requester-regression.api.test.ts | Pass |
| API-19 | API | AC-17 | Staff Queue search/filter/sort/paginate | Correct subset + pagination metadata for each param combination | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| API-20 | API | BR-17 | Staff Queue returns cross-Requester data | Tickets from multiple Requesters appear in one staff query | server/tests/lab-03/staff-queue.api.test.ts | Pass |
| API-21 | API | AC-07 | Claim unassigned ticket | ticketOwnerId set to acting staff user | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-22 | API | AC-07 | Reassign owned ticket | ticketOwnerId set to target; rejects invalid/non-staff target (422 INVALID_OWNER) | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-23 | API | BR-12 | Claim/reassign race | Concurrent conflicting update returns 409 OWNERSHIP_CHANGED | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-24 | API | BR-13 | Set IT Priority | 200 on valid value; 400 on invalid/missing | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-25 | API | AC-08 | Invalid status transition | 409 INVALID_TRANSITION; status unchanged | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-26 | API | §4.7 | All legal status transitions | Every matrix pair succeeds; REOPENED clears requesterIndicatedResolved | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-27 | API | BR-14 | Resolve/close unassigned ticket | 409 UNASSIGNED_TICKET when ticketOwnerId is null | server/tests/lab-03/staff-ticket-detail.api.test.ts | Pass |
| API-28 | API | AC-16 | Non-Administrator hits /api/admin/* | 403 FORBIDDEN on every admin endpoint | server/tests/lab-03/authorization.api.test.ts | Pass |
| API-29 | API | BR-10 | Requester attempts staff-only fields | Direct POST to claim/priority/status/notes endpoints as Requester → 403 | server/tests/lab-03/authorization.api.test.ts | Pass |
| API-30 | API | FR-17 | Admin user list, search, role filter | Correct results for search and role combinations | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-31 | API | FR-18 | Create user | 201; mustChangePassword=true; role/isActive persisted | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-32 | API | AC-13 | Duplicate email on create/edit | 409 DUPLICATE_EMAIL; no record changed | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-33 | API | FR-19 | Edit user (name/email/role/activation) | 200; only supplied fields changed | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-34 | API | AC-14 | Reset password | mustChangePassword=true; next login forces Change Password (chained with API-06) | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-35 | API | AC-12 | Self-deactivation attempt | 403 SELF_DEACTIVATION_FORBIDDEN | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-36 | API | AC-11 | Last active Administrator protection | 409 LAST_ADMIN_PROTECTED on deactivate or role change | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-37 | API | BR-21 | Deactivated user data integrity | Inactive user's historical tickets/comments/notes remain intact and queryable by authorized roles | server/tests/lab-03/users-admin.api.test.ts | Pass |
| API-38 | API | BR-01 | Deactivated user cannot authenticate | Login for a just-deactivated account fails (API-03 variant, chained) | server/tests/lab-03/auth.api.test.ts | Pass |

## 3. UI Component Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | File | Final |
|---|---|---|---|---|---|---|
| UI-01 | Component | FR-01/AC-05 | Login.tsx | Renders fields, disables submit while busy, shows generic failure banner | client/.../lab-03 tests/Login.test.tsx | Pass |
| UI-02 | Component | AC-02 | ChangePassword.tsx | Blocks navigation while mustChangePassword; validates rule hints; success redirects | client/.../lab-03 tests/ChangePassword.test.tsx | Pass |
| UI-03 | Component | FR-10/AC-17 | StaffTicketQueue.tsx | Renders search/filter/sort/pagination controls; empty vs no-results distinction | client/.../lab-03 tests/StaffTicketQueue.test.tsx | Pass |
| UI-04 | Component | FR-12/13/14/16 | StaffTicketDetail.tsx | Claim/Reassign control, IT Priority select, Status select only shows legal targets, Internal Notes visually separate from Public Comments | client/.../lab-03 tests/StaffTicketDetail.test.tsx | Pass |
| UI-05 | Component | FR-17-22 | UserManagement.tsx | List renders Name/Email/Role/Status/Edit; create/edit panel fields; self-deactivation and last-Admin controls render disabled with tooltip | client/.../lab-03 tests/UserManagement.test.tsx | Pass |
| UI-06 | Component | §6 | RequesterTicketDetail (comments addition) | Public Comments thread renders; "Problem Appears Resolved" button toggles to confirmed state | client/.../lab-03 tests/RequesterTicketDetail.test.tsx | Pass |

## 4. UI Style / Visual Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | File | Final |
|---|---|---|---|---|---|---|
| STYLE-01 | UI Style | §2 | New badge tokens (Role, new statuses) | Match Zen Green palette rules; sufficient contrast | client/.../lab-03 tests/badges.style.test.tsx | Pass |
| STYLE-02 | UI Style | §8 | Public Comments vs Internal Notes styling | Distinct background/border/label; never visually interchangeable | client/.../lab-03 tests/threadStyles.style.test.tsx | Pass |
| STYLE-03 | UI Style | §9 | Editable vs read-only field styling on Admin/Staff panels | Consistent with Lab 2 conventions | client/.../lab-03 tests/fieldStyles.style.test.tsx | Pass |

## 5. Responsive Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | File | Final |
|---|---|---|---|---|---|---|
| RESP-01 | Responsive | AC-18 | Staff Ticket Queue at <768px | Cards, no horizontal scroll | e2e/lab-03/staff-ticket-flow.spec.ts | Pass |
| RESP-02 | Responsive | AC-18 | Admin User Management at <768px | Cards + full-screen create/edit sheet, no horizontal scroll | e2e/lab-03/user-administration.spec.ts | Pass |
| RESP-03 | Responsive | §11 | Login/Change Password at desktop/tablet/mobile | Single-column layout holds at all breakpoints | e2e/lab-03/authentication.spec.ts | Pass |

## 6. Security / Authorization Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | File | Final |
|---|---|---|---|---|---|---|
| SEC-01 | Security | AC-03 | Session identity cannot be overridden | Forged/extra body field for requesterId is ignored server-side | server/tests/lab-03/authorization.api.test.ts | Pass |
| SEC-02 | Security | AC-04/BR-27 | Internal Note endpoint short-circuits for Requester | No DB read of note content occurs for a rejected Requester call (verified via spy/mock) | server/tests/lab-03/authorization.api.test.ts | Pass |
| SEC-03 | Security | AC-16 | Every /api/admin/* and /api/staff/* route | Direct curl/Supertest call with a Requester session returns 403 for all routes | server/tests/lab-03/authorization.api.test.ts | Pass |
| SEC-04 | Security | BR-04 | No plaintext password persistence | DB row inspection confirms only passwordHash column, never a password column/value | server/tests/lab-03/authorization.api.test.ts | Pass |
| SEC-05 | Security | BR-26 | Cross-Requester ticket/comment access | 404, not 403, returned to avoid existence leakage | server/tests/lab-03/authorization.api.test.ts | Pass |

## 7. Migration / Regression Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | File | Final |
|---|---|---|---|---|---|---|
| MIG-01 | Migration | BR-24/BR-25 | RequesterUser → User migration | All Lab 2 seeded Requesters exist as User rows with role REQUESTER, correct email/name preserved | server/tests/lab-03/migration.api.test.ts | Pass |
| MIG-02 | Migration | BR-24 | Ticket ownership preserved | Every pre-migration Ticket.requesterId resolves to the same person post-migration | server/tests/lab-03/migration.api.test.ts | Pass |
| MIG-03 | Regression | AC-15 | Full Lab 2 Requester flow post-migration | Create/search/filter/sort/paginate/detail/attachment add-remove all still pass | server/tests/lab-03/requester-regression.api.test.ts | Pass |
| MIG-04 | Regression | §7.1 | x-requester-id header fully removed | Old header is ignored/absent from code paths; requests without a session are 401, not treated as Requester 1 | server/tests/lab-03/authorization.api.test.ts | Pass |

## 8. End-to-End Tests

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | File | Final |
|---|---|---|---|---|---|---|
| E2E-01 | E2E | AC-01/AC-06 | Login → browse → logout → blocked access | Full session lifecycle; direct URL access after logout redirects to Login | e2e/lab-03/authentication.spec.ts | Pass |
| E2E-02 | E2E | AC-02 | Initial password login and change | Normal app opens only after valid change | e2e/lab-03/authentication.spec.ts | Pass |
| E2E-03 | E2E | FR-07-09 | Requester ticket lifecycle + comment + resolved indication | End-to-end create ticket, comment, mark resolved-indication | e2e/lab-03/authentication.spec.ts | Pass |
| E2E-04 | E2E | FR-10-16 | IT Staff full ticket workflow | Queue → open → claim → priority → status → comment → note, end-to-end | e2e/lab-03/staff-ticket-flow.spec.ts | Pass |
| E2E-05 | E2E | FR-17-22 | Administrator full user lifecycle | Create → search/find → edit → reset password → deactivate (non-self, non-last-admin) | e2e/lab-03/user-administration.spec.ts | Pass |
| E2E-06 | E2E | AC-11/AC-12 | Admin safety-rule UI | Self-deactivation and last-Admin controls are disabled in the running UI, not just the API | e2e/lab-03/user-administration.spec.ts | Pass |

## 9. Accessibility

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | File | Final |
|---|---|---|---|---|---|---|
| A11Y-01 | Accessibility | §11 | Login/Change Password/Admin forms | Labels associated with inputs, visible focus states, keyboard-only completion | e2e/lab-03/authentication.spec.ts, e2e/lab-03/user-administration.spec.ts | Pass |

## 10. Safe Failures

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | File | Final |
|---|---|---|---|---|---|---|
| FAIL-01 | Safe Failure | FR-23 | Backend unreachable during login/claim/status/admin-create | Generic failure banner shown; no stack trace/internal detail leaked; entered values preserved where applicable | client/.../lab-03 tests/* (mocked network failure) | Pass |

---

**Traceability note:** this table is the authoritative planned-test list, created
alongside `specification.md` and before implementation. Final "Pass" status is updated
only from actual `npx vitest run` / Playwright output on the final `main` branch, never
back-filled from whichever tests a coding agent happened to generate.
