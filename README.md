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

## License

Educational project for CPE 334, King Mongkut's University of Technology Thonburi (KMUTT).