# Lab 4 release checks (Issue #67, DoD §10)

Run on 2026-10-29. Every database below was a throwaway PostgreSQL database, created for
the check and dropped at the end. The developer's `toktickit_db` and `.env` files were
not touched: clones got their own `.env` from `.env.example`, and other commands
exported `DATABASE_URL` for that shell only. Each command is followed by the last lines
it printed and its exit code.

| Part | Code | Database | Result |
|---|---|---|---|
| 1. Clean clone | fresh clone of `lab4-staging` at `a7342fc0` (merge of PR #74) | `toktickit_lab4_check` (empty) | install, generate, migrate, seed ×2 (second run creates 0 tickets; table counts unchanged by a third run), server 220/220, client 106/106, Playwright 140/140 |
| 2. Lab 3 → Lab 4 migration | fresh clone of `main` at `0291eedd` (Lab 3 release) to build the Lab 3 database, then the Part 1 clone to migrate it | `toktickit_lab3_copy` | every pre-existing Lab 1–3 row unchanged (row fingerprints), `resolvedAt` backfilled for RESOLVED/CLOSED only, legacy tickets with 0 actions; `scripts/lab4-rollback.sql` removes every Lab 4 object and leaves Lab 1–3 rows unchanged; `migrate deploy` re-applies cleanly |
| 3. Release candidate | `feature/67-release-integration` at `dabd3a65` | `toktickit_lab4_check` (fresh, migrated and seeded) | metrics check on seeded data 42/0 mismatches, screenshots 21/21 (no console error), Playwright 143/143 |

## Part 1: clean clone

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

```

## Part 2: migration of a Lab 3 database, rollback, re-migration

```text
$ git clone -q --branch main <repo> main-clone
    -> exit 0
$ npm install --no-audit --no-fund
    added 220 packages in 19s
    -> exit 0
$ npx prisma generate
    Prisma schema loaded from prisma/schema.prisma
    ✔ Generated Prisma Client (v5.22.0) to ./node_modules/@prisma/client in 449ms
    -> exit 0
$ createdb toktickit_lab3_copy
    -> exit 0
$ npm run db:migrate
    Applying migration `20260915000002_lab3_password_not_null`
    The following migration(s) have been applied:
    migrations/
    All migrations have been successfully applied.
    -> exit 0
$ npm run db:seed
      IT Staff:   4 (1 inactive)
      Admin:      1 (admin@example.com)
      All seeded accounts use password: DevPass123! (local dev only)
    🌱  The seed command has been executed.
    -> exit 0
    fingerprint before Lab 4 (rows, md5 of Lab 3 columns): {'Attachment': '0 d41d8cd98f00b204e9800998ecf8427e', 'Category': '4 c4edd2a649446554af4eb1b5d0fade31', 'RelatedSystem': '7 31a8b87568d9f942feaca6b0363a0bbd', 'Ticket': '8 d8bb26c8943a22738543147b692a0ef2', 'TicketComment': '5 9d708fae126d744e8a4dc61a4a123fa5', 'TicketInternalNote': '5 6bea269051150207cb2de2f519308317', 'TicketSequence': '1 21202c1563d0c2ce9104b69f0c97e0c3', 'User': '10 336c742a59b879e16f157a8605b23648'}
# Lab 4 clone (lab4-staging a7342fc0) on the Lab 3 copy
$ npm run db:migrate
    Applying migration `20261028000001_lab4_actions_taken`
    The following migration(s) have been applied:
    migrations/
    All migrations have been successfully applied.
    -> exit 0
$ npm run db:seed
      Admin:      1 (admin@example.com)
      Lab 4:      6 tickets (6 created this run), 9 Actions Taken; nina.patel@toktickit.test has no ticket
      All seeded accounts use password: DevPass123! (local dev only)
    🌱  The seed command has been executed.
    -> exit 0
$ npm run db:seed
      Admin:      1 (admin@example.com)
      Lab 4:      6 tickets (0 created this run), 9 Actions Taken; nina.patel@toktickit.test has no ticket
      All seeded accounts use password: DevPass123! (local dev only)
    🌱  The seed command has been executed.
    -> exit 0
    fingerprint after migrate + seed x2: every Lab 1-3 table UNCHANGED for the pre-existing rows (TicketSequence advanced by the Lab 4 seed tickets); resolvedAt backfilled for the RESOLVED and CLOSED legacy tickets only; legacy tickets have 0 Actions Taken
# Rollback (scripts/lab4-rollback.sql) on the same copy
$ pg_dump -d toktickit_lab3_copy --format=custom --file=<scratch>/before-rollback.dump
    -> exit 0
$ psql -d toktickit_lab3_copy -v ON_ERROR_STOP=1 -f <repo>/scripts/lab4-rollback.sql
    DROP INDEX
    ALTER TABLE
    DELETE 1
    COMMIT
    -> exit 0
    check after rollback: ActionTaken and TicketStatusChange dropped = t, Ticket.resolvedAt columns = 0, Lab 4 migration rows = 0
    fingerprint after rollback: every Lab 1-3 table UNCHANGED for the pre-existing rows (TicketSequence advanced by the Lab 4 seed)
$ npm run db:migrate
    Applying migration `20261028000001_lab4_actions_taken`
    The following migration(s) have been applied:
    migrations/
    All migrations have been successfully applied.
    -> exit 0
    after re-running npm run db:migrate: ActionTaken exists = t
$ dropdb toktickit_lab3_copy
    -> exit 0
```

## Part 3: release candidate on a fresh database

```text
$ createdb toktickit_lab4_check
    -> exit 0
$ npm run db:migrate
    Applying migration `20261028000001_lab4_actions_taken`
    The following migration(s) have been applied:
    migrations/
    All migrations have been successfully applied.
    -> exit 0
$ npm run db:seed
      Admin:      1 (admin@example.com)
      Lab 4:      6 tickets (6 created this run), 9 Actions Taken; nina.patel@toktickit.test has no ticket
      All seeded accounts use password: DevPass123! (local dev only)
    🌱  The seed command has been executed.
    -> exit 0
$ npm run --silent lab4:metrics-check > artifacts/lab-04/metrics-check.txt   (seeded data only, default accounts)
    42 metrics, 0 mismatch(es)
    -> exit 0
$ npm run dev   (background, DATABASE_URL -> toktickit_lab4_check)
$ npx playwright test e2e/lab-04/screenshots.spec.ts --workers=1
      21 passed (3.7m)
    -> exit 0
$ npm run test:e2e -- --workers=2   (feature/67-release-integration at dabd3a65)
      143 passed (10.2m)
    -> exit 0
$ dropdb toktickit_lab4_check
    -> exit 0
```
