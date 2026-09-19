-- prisma/migrations/20260915000001_lab3_auth_roles/migration.sql
-- Step 1/2: schema changes. passwordHash stays nullable here on purpose —
-- it is backfilled by scripts/migrate-lab2-passwords.ts before migration 2/2
-- makes it NOT NULL. Running this as one migration with a NOT NULL column
-- and no default would fail against existing RequesterUser rows.

-- 1. Rename RequesterUser -> User (PostgreSQL RENAME preserves all rows,
--    constraints, and the sequence; Ticket.requesterId keeps pointing at the
--    same rows with no data change).
ALTER TABLE "RequesterUser" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "RequesterUser_pkey" TO "User_pkey";
ALTER INDEX "RequesterUser_email_key" RENAME TO "User_email_key";
ALTER SEQUENCE "RequesterUser_id_seq" RENAME TO "User_id_seq";

-- 2. New Role enum + columns on User.
CREATE TYPE "Role" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR');

ALTER TABLE "User"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "role" "Role" NOT NULL DEFAULT 'REQUESTER',
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "User_role_idx" ON "User"("role");

-- 3. Extend TicketStatus. Each ALTER TYPE ... ADD VALUE must run outside a
--    surrounding transaction on PostgreSQL < 12; if `prisma migrate deploy`
--    errors here, split these four lines into their own migration file run
--    immediately before this one.
ALTER TYPE "TicketStatus" ADD VALUE 'WAITING_FOR_REQUESTER';
ALTER TYPE "TicketStatus" ADD VALUE 'CLOSED';
ALTER TYPE "TicketStatus" ADD VALUE 'REOPENED';
ALTER TYPE "TicketStatus" ADD VALUE 'CANCELLED';

-- 4. Ticket additions.
ALTER TABLE "Ticket"
  ADD COLUMN "ticketOwnerId" INTEGER,
  ADD COLUMN "requesterIndicatedResolved" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_ticketOwnerId_fkey"
  FOREIGN KEY ("ticketOwnerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Ticket_ticketOwnerId_idx" ON "Ticket"("ticketOwnerId");

-- itPriority column already exists (nullable) from Lab 2 — no change needed,
-- it simply becomes writable at the application layer in Lab 3.

-- 5. Public Comments / Internal Notes (empty on migration — no Lab 2 data).
CREATE TABLE "TicketComment" (
  "id"        SERIAL PRIMARY KEY,
  "ticketId"  INTEGER NOT NULL REFERENCES "Ticket"("id"),
  "authorId"  INTEGER NOT NULL REFERENCES "User"("id"),
  "content"   TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TicketComment_ticketId_idx" ON "TicketComment"("ticketId");

CREATE TABLE "TicketInternalNote" (
  "id"        SERIAL PRIMARY KEY,
  "ticketId"  INTEGER NOT NULL REFERENCES "Ticket"("id"),
  "authorId"  INTEGER NOT NULL REFERENCES "User"("id"),
  "content"   TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TicketInternalNote_ticketId_idx" ON "TicketInternalNote"("ticketId");
