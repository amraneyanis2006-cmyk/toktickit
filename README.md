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

## License

Educational project for CPE 334, King Mongkut's University of Technology Thonburi (KMUTT).

