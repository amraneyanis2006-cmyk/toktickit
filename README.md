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
npm run db:migrate       # applies all migrations (Lab 1 through Lab 3)
npm run db:seed          # seeds Categories, Related Systems, Requesters, IT Staff, Administrator, sample Tickets
```

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

## License

Educational project for CPE 334, King Mongkut's University of Technology Thonburi (KMUTT).
