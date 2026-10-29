# TokTickIT

TokTickIT is an IT service desk application for Account and Access, Hardware, Software, and Network requests. This repository contains the Lab 1 full-stack vertical slice for CPE 334 — Introduction to Software Engineering in the Age of AI Agents.

**Lab 1 goal:** prove that the full technology stack works end-to-end — React UI → Express REST API → Prisma ORM → PostgreSQL DB — by displaying a live backend health check and the four seeded IT request categories.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite + Bootstrap |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Testing | Vitest (frontend) + Supertest (backend API) |

## Prerequisites

- Node.js (v18 or later)
- npm
- PostgreSQL running locally (or accessible via connection string)

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/amraneyanis2006-cmyk/toktickit.git
cd toktickit
```

### 2. Backend setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env` and set your PostgreSQL connection string:

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/toktickit"
```

Run Prisma migrations and seed the database:

```bash
npx prisma migrate dev
npx prisma db seed
```

Start the backend server:

```bash
npm run dev
```

The API will be available at `http://localhost:3000`.

### 3. Frontend setup

Open a second terminal:

```bash
cd client
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### 4. Using the app

1. Open `http://localhost:5173` in your browser.
2. Click **Check System**.
3. The page will show a loading state, then either:
- **System Status: Online** and the four supported categories, or
- **System Status: Offline** with an error message if the backend/database is unavailable.

## API Endpoints

### Health check

```
GET /api/health
```

```json
{
"status": "ok",
"service": "TokTickIT API"
}
```

### Category list

```
GET /api/categories
```

```json
[
  { "id": 1, "name": "Account and Access" },
  { "id": 2, "name": "Hardware" },
  { "id": 3, "name": "Software" },
  { "id": 4, "name": "Network" }
]
```

## Running Tests

### Backend (Supertest)

```bash
cd server
npx vitest run
```

Covers:
- `GET /api/health` returns 200 and `status: "ok"`
- `GET /api/categories` returns the four seeded categories

### Frontend (Vitest)

```bash
cd client
npx vitest run
```

Covers:
- TokTickIT heading renders
- Loading state transitions to the category list on success
- A useful error message is shown on API failure

## Git Workflow

This project follows a Git Flow-style branching model for Lab 1:

- `main` — stable, production-like branch
- `lab1-staging` — Lab 1 integration branch
- `feature/*` — one feature branch per GitHub Issue, merged into `lab1-staging` via peer-reviewed Pull Requests

See the [GitHub Project board](https://github.com/users/amraneyanis2006-cmyk/projects/2) for issue tracking and [`docs/lab-01/reviewer.md`](docs/lab-01/reviewer.md) for peer review records.

## Environment Variables

See `.env.example` in `server/` for the required variables. Never commit `.env` — it is excluded via `.gitignore`.

---

# Lab 2 — Requester Ticketing MVP

Lab 2 extends the Lab 1 vertical slice into a full Requester-facing ticketing experience: Development Requester selection (testing-only identity), ticket creation with attachments, a searchable/filterable/sortable/paginated My Tickets list, a read-only Ticket Detail screen, and the attachment lifecycle (add / soft-remove).

Full contract documents: [`docs/lab-02/specification.md`](docs/lab-02/specification.md), [`docs/lab-02/api-spec.md`](docs/lab-02/api-spec.md), [`docs/lab-02/ui-spec.md`](docs/lab-02/ui-spec.md), [`docs/lab-02/tests.md`](docs/lab-02/tests.md).

## Tech Stack (Lab 2 additions)

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Bootstrap 5 + React Router v7 |
| Backend | Node.js + Express 5 + TypeScript |
| Database | PostgreSQL + Prisma 7 |
| Testing | Vitest + Supertest (backend) · Vitest + Testing Library (frontend) · Playwright (E2E, responsive, visual — Chromium only) |

## Setup (clean clone)

The Lab 1 setup steps above still apply (clone, `npm install` in `server/` and `client/`, copy `.env`). No new environment variables were introduced in Lab 2 — the same `DATABASE_URL` and `PORT` from `.env.example` are sufficient:

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/toktickit_db?schema=public"
PORT=3000
```

Run migrations and seed the Lab 2 data (Categories, Related Systems, Development Requesters — including one intentionally inactive Requester for BR-06/AC-15 testing):

```bash
cd server
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Attachment storage (`server/uploads/`) requires no manual setup — the directory is created automatically on first upload (`fs.mkdir(..., { recursive: true })`) and its contents are gitignored; only `server/uploads/.gitignore` itself is tracked.

Start the frontend as in Lab 1 (`cd client && npm install && npm run dev`), then open `http://localhost:5173`, select a Development Requester, and use the app.

## Running Tests (Lab 2)

```bash
# Backend unit + API tests
cd server && npx vitest run

# Frontend component tests
cd client && npx vitest run

# End-to-end + responsive + visual tests (Playwright, Chromium only)
npx playwright test e2e/lab-02
```

All three commands must exit with zero failures, with zero skipped or `.only`/`.skip`-marked tests, per the Lab 2 Definition of Done ([`docs/lab-02/specification.md`](docs/lab-02/specification.md) §10). See [`docs/lab-02/tests.md`](docs/lab-02/tests.md) for the full test plan, per-test traceability to Acceptance Criteria, and final results.

## Git Workflow (Lab 2)

Lab 2 follows the same Git Flow-style model as Lab 1, scoped to its own staging branch:

- `main` — stable, production-like branch
- `lab2-staging` — Lab 2 integration branch
- `feature/N-name` — one feature branch per GitHub Issue, merged into `lab2-staging` via peer-reviewed Pull Requests

See [`docs/lab-02/reviewer.md`](docs/lab-02/reviewer.md) for peer review records and [`docs/lab-02/ai_use.md`](docs/lab-02/ai-use.md) for the AI usage log.


---

# Lab 3 — Roles, Authentication, IT Staff & Administrator Workflows

Lab 3 replaces the Development Requester selector with real session-based authentication and adds three roles: **Requester** (the existing Lab 2 experience, now behind a real login), **IT Staff** (a Ticket Queue and full ticket-operations screen: claim/reassign, priority, status transitions, Public Comments, Internal Notes), and **Administrator** (User Management: create, search, edit, deactivate, reset password).

Full contract documents: [`docs/lab-03/specification.md`](docs/lab-03/specification.md), [`docs/lab-03/api-spec.md`](docs/lab-03/api-spec.md), [`docs/lab-03/ui-spec.md`](docs/lab-03/ui-spec.md), [`docs/lab-03/tests.md`](docs/lab-03/tests.md).

## Tech Stack (Lab 3 additions)

| Layer | Technology |
|---|---|
| Auth | `express-session` (server-side sessions, `httpOnly` cookie), `bcrypt` password hashing |
| Testing | Same as Lab 2, plus deterministic Playwright fixtures (`e2e/global-setup.ts`) and Vitest component "style" tests for visual/token conformance |

## Setup (clean clone)

The Lab 1/2 setup steps still apply. Lab 3 adds one new environment variable, `SESSION_SECRET`, required by the server (not the root Prisma CLI):

```bash
cd server
cp .env.example .env
```

Edit `server/.env`:

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/toktickit_db?schema=public"
PORT=3000
SESSION_SECRET="any long random string"
```

The root `.env` (used by the Prisma CLI when run from the repository root) only needs `DATABASE_URL` and `PORT` — see the root `.env.example`.

From the **repository root**, install everything and set up the database in one pass:

```bash
npm install
npm run install:all      # installs server/ and client/ dependencies too
npx prisma generate      # generates the Prisma Client from prisma/schema.prisma
npm run db:migrate       # applies all migrations (Lab 1 through Lab 3)
npm run db:seed          # seeds Categories, Related Systems, Requesters, IT Staff, Administrator, sample Tickets
```

`npx prisma generate` is required and is not always run automatically: newer npm versions can block a dependency's `postinstall` script by default (you may see an `npm warn install-scripts` notice during `npm install`), and `@prisma/client`'s generation step is one such script. Skipping it leaves a stale/incomplete client in place and every database query returns `500 Internal Server Error`, including on the simplest endpoints (e.g. `GET /api/categories`) — this was caught and confirmed by verification against a genuinely fresh clone and a disposable database while preparing the Lab 3 release, exactly the DoD §10 scenario. If any endpoint returns 500 immediately after setup, re-run `npx prisma generate` from the repository root first.

`db:seed` is self-sufficient on a genuinely fresh database: it creates the 5 Lab 2-style Requester accounts (4 active, 1 inactive) directly if they don't already exist. The separate migration-backfill script (`npm run db:migrate-passwords`) is only relevant if you are carrying over a real pre-Lab-3 database that already has `RequesterUser` rows with no password — on a fresh clone it correctly reports "Nothing to do."

Start both servers:

```bash
npm run dev               # server on :3000, client on :5173, in one command
```

Open `http://localhost:5173` and log in. Seeded credentials (**local development only**):

| Role | Email | Password |
|---|---|---|
| Requester | `jennifer.anderson@toktickit.test` | `DevPass123!` |
| IT Staff | `alex.kim@example.com` | `DevPass123!` |
| Administrator | `admin@example.com` | `DevPass123!` |

`npm run lab4:metrics-check` logs in with these accounts; set `LAB4_CHECK_PASSWORD` if your seed uses another password (the fallback is `DevPass123!`) and `LAB4_CHECK_REQUESTER` to use another Requester.

## Running Tests (Lab 3)

From the repository root:

```bash
npm run test          # server (Vitest/Supertest) + client (Vitest/Testing Library)
npm run test:e2e       # Playwright: e2e/lab-02 (migrated) + e2e/lab-03 (new), Chromium only
```

`test:e2e` needs both dev servers running first (`npm run dev` in another terminal) — Playwright does not start them itself. It seeds its own deterministic fixture accounts and tickets on every run (`e2e/global-setup.ts`) and cleans up nothing destructive in the shared database beyond those fixtures.

All commands must exit with zero failures, with zero skipped or `.only`/`.skip`-marked tests, per the Lab 3 Definition of Done ([`docs/lab-03/specification.md`](docs/lab-03/specification.md) §10). See [`docs/lab-03/tests.md`](docs/lab-03/tests.md) for the full test plan and per-test traceability to Acceptance Criteria.

## Git Workflow (Lab 3)

Same Git Flow-style model, scoped to its own staging branch:

- `main` — stable, production-like branch
- `lab3-staging` — Lab 3 integration branch
- `feature/N-name` — one feature branch per GitHub Issue, merged into `lab3-staging` via peer-reviewed Pull Requests

See [`docs/lab-03/reviewer.md`](docs/lab-03/reviewer.md) for peer review records and [`docs/lab-03/ai-use.md`](docs/lab-03/ai-use.md) for the AI usage log.

## Lab 4: Actions Taken, Ticket Workflow, Dashboards

### What is new
- **Actions Taken** on the Staff Ticket Detail: record, start, complete (with a Result) and cancel the work done on a ticket. Finished actions are locked, stale edits are rejected (`409 STALE_UPDATE`), and a retried create never duplicates (`clientRequestId`). Requesters see the actions read-only ("Work done on your ticket").
- **Ticket workflow**: the status select offers only legal transitions. Resolving needs a Ticket Owner, at least one completed action and no open action (`409 RESOLUTION_BLOCKED` otherwise). Cancelling a ticket cancels its open actions. Every change is kept in the Status History.
- **Dashboards** at `/dashboard`, where every role now lands after login (CHG-01):
  - Requesters see their own counts, a Needs Your Attention list and Recently Updated.
  - IT Staff see Unassigned, My Open Tickets, Awaiting Review, High Priority Open and My Open Actions, counts by status and IT priority, and lists.
  - Administrators also get a User Accounts card.
  - Every card drills down to a list filtered the same way (a "Filtered from Dashboard" chip shows it).
- `GET /api/health/db` reports the database status. `GET /api/health` is unchanged.
- Contract: [`docs/lab-04/specification.md`](docs/lab-04/specification.md), [`api-spec.md`](docs/lab-04/api-spec.md), [`ui-spec.md`](docs/lab-04/ui-spec.md), [`tests.md`](docs/lab-04/tests.md).

### Migrate, roll back, seed
The Lab 4 migration (`prisma/migrations/20261028000001_lab4_actions_taken`) only adds objects. Back up first:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=toktickit-before-lab4.dump
npm run db:migrate        # prisma migrate deploy: applies the Lab 4 migration
npx prisma generate
npm run db:seed           # idempotent: running it twice creates nothing new
```

Rollback (destroys every Action Taken, Status History row and `resolvedAt`; Lab 1–3 data is not touched):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/lab4-rollback.sql
# then check out the Lab 3 schema and run: npx prisma generate
# or restore the backup: pg_restore --clean --dbname "$DATABASE_URL" toktickit-before-lab4.dump
```

### Metrics check (dashboard values vs. direct SQL)

```bash
npm run lab4:metrics-check > artifacts/lab-04/metrics-check.txt   # exits 1 on any mismatch
```

It logs in with the seeded accounts below. `LAB4_CHECK_PASSWORD` overrides the password, and `LAB4_CHECK_REQUESTER` overrides the Requester (default `jennifer.anderson@toktickit.test`).

### Tests

```bash
npm run test                                              # server + client (Vitest), Labs 1–4
npm run dev                                               # in another terminal, for Playwright
npm run test:e2e -- --workers=2                           # all Playwright specs, Labs 2–4
npx playwright test e2e/lab-04/screenshots.spec.ts --workers=1   # SHOT-01: artifacts/lab-04/screenshots/ + INDEX.md
```

The screenshots spec also has a `demo` group that logs in with the seeded accounts below (it needs a database seeded per this README). Playwright resets its own fixtures on every run (`e2e/global-setup.ts`). The Lab 4 ones use the `TKT-L4E-` ticket numbers and the `e2e-*-l4`, `e2e-requester-empty`, `e2e-staff-idle` and `e2e-staff-leaving*` accounts. The Lab 2/3 fixtures are unchanged.

The clean-clone check of this release (fresh clone, throwaway database, migrate, seed twice, every suite) is logged in [`artifacts/lab-04/clean-clone-check.md`](artifacts/lab-04/clean-clone-check.md).

### Demo script (seeded accounts, password `DevPass123!`, local only)
1. **IT Staff**: log in as `alex.kim@example.com`. You land on the Dashboard.
   - Click "View all" on Unassigned: the Ticket Queue shows the same total, with the "Filtered from Dashboard" chip.
2. **Actions Taken**: open one of Alex's In Progress tickets and use **Add Action**.
   - Save once with "Follow-up Required?" checked and no note to see the field error.
   - Then save, **Start**, and **Complete** it with a Result. The row becomes Completed and locked.
3. **Workflow**:
   - With an open action, "Resolved" is disabled and the reason is shown.
   - Cancel or complete the open actions, then choose Resolved. The badge, "Resolved on" and the Status History refresh.
4. **Requester**: log in as `jennifer.anderson@toktickit.test`.
   - The dashboard counts only Jennifer's tickets.
   - The resolved ticket shows "Work done on your ticket" and its history, read-only.
5. **Empty states**: `nina.patel@toktickit.test` (no tickets) and `somsak.charoen@example.com` (no open action) show zeros and empty-state texts, not errors.
6. **Administrator**: log in as `admin@example.com`. The User Accounts card links to User Management filtered by role or by active status.

## License

Educational project for CPE 334, King Mongkut's University of Technology Thonburi (KMUTT).
