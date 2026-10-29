# Lab 4 clean-clone check (Issue #67, DoD §10)

- **Date:** 2026-10-29T09:41Z
- **Code:** `lab4-staging` at `a7342fc0` (merge of PR #74), cloned into an empty folder.
- **Database:** a throwaway PostgreSQL database `toktickit_lab4_check`, created for this check and dropped at the end. The developer's `toktickit_db` and `.env` files were not touched: the clone got its own `.env` files from `.env.example`.
- **Result:** every step exited 0. Seed idempotent (second run created 0 tickets, table counts unchanged by a third run). Server 220/220, client 106/106, Playwright 140/140, 0 failed, 0 skipped.
- **Step c:** the e2e run leaves test data, so the database was recreated fresh (migrate + seed) before the report screenshots and the metrics check.

Each command below is followed by the last lines it printed and its exit code.

```text
$ git clone -q --branch lab4-staging <repo> clone
    -> exit 0
$ npm install --no-audit --no-fund
    npm warn install-scripts   prisma@5.22.0 (preinstall: node scripts/preinstall-entry.js)
    npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
    npm warn install-scripts
    npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
    -> exit 0
$ npm run install:all
    npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
    npm warn install-scripts   fsevents@2.3.3 (install: (install scripts present))
    npm warn install-scripts
    npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
    -> exit 0
$ npx prisma generate
    Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)
    
    Tip: Easily identify and fix slow SQL queries in your app. Optimize helps you enhance your visibility: https://pris.ly/--optimize
    
    -> exit 0
$ cp .env.example .env; cp server/.env.example server/.env  (DATABASE_URL -> toktickit_lab4_check)
$ createdb toktickit_lab4_check
    -> exit 0
$ npm run db:migrate
    │  https://pris.ly/d/major-version-upgrade                │
    │                                                         │
    │  Run the following to update                            │
    │    npm i --save-dev prisma@latest                       │
    │    npm i @prisma/client@latest                          │
    └─────────────────────────────────────────────────────────┘
    -> exit 0
$ npm run db:seed
      IT Staff:   4 (1 inactive)
      Admin:      1 (admin@example.com)
      Lab 4:      6 tickets (6 created this run), 9 Actions Taken; nina.patel@toktickit.test has no ticket
      All seeded accounts use password: DevPass123! (local dev only)
    
    🌱  The seed command has been executed.
    -> exit 0
$ npm run db:seed
      IT Staff:   4 (1 inactive)
      Admin:      1 (admin@example.com)
      Lab 4:      6 tickets (0 created this run), 9 Actions Taken; nina.patel@toktickit.test has no ticket
      All seeded accounts use password: DevPass123! (local dev only)
    
    🌱  The seed command has been executed.
    -> exit 0
$ npm run db:seed   (3rd run, extra idempotency check)
    table counts after run 2 and run 3: 11|14|9|10|5|5|4 / 11|14|9|10|5|5|4 (users|tickets|actions|history|comments|notes|categories) -> identical
$ cd server && npx vitest run
     Test Files  28 passed (28)
          Tests  220 passed (220)
       Start at  16:24:05
       Duration  146.46s (transform 1.65s, setup 0ms, import 12.24s, tests 123.11s, environment 9ms)
    
    -> exit 0
$ cd client && npx vitest run
     Test Files  17 passed (17)
          Tests  106 passed (106)
       Start at  16:26:41
       Duration  81.34s (transform 3.67s, setup 8.98s, import 11.84s, tests 57.12s, environment 65.78s)
    
    -> exit 0
$ npm run dev   (background, clone, DATABASE_URL -> toktickit_lab4_check)
$ npm run test:e2e -- --workers=2
      140 passed (7.5m)
    -> exit 0

## Step c: fresh throwaway database for the report screenshots (the e2e run above left test data)
$ dropdb toktickit_lab4_check
    -> exit 0
$ createdb toktickit_lab4_check
    -> exit 0
$ npm run db:migrate
        └─ migration.sql
          
    All migrations have been successfully applied.
    -> exit 0
$ npm run db:seed
    │    npm i --save-dev prisma@latest                       │
    │    npm i @prisma/client@latest                          │
    └─────────────────────────────────────────────────────────┘
    -> exit 0
$ npm run dev  (background, DATABASE_URL -> toktickit_lab4_check)
$ npx playwright test e2e/lab-04/screenshots.spec.ts --workers=1
      21 passed (2.7m)
    -> exit 0
$ npm run --silent lab4:metrics-check > artifacts/lab-04/metrics-check.txt   (default accounts, no LAB4_CHECK_REQUESTER)
    42 metrics, 0 mismatch(es)
    -> exit 0
$ dropdb toktickit_lab4_check
    -> exit 0
```
