-- scripts/lab4-rollback.sql - documented recovery for the Lab 4 migration
-- 20261028000001_lab4_actions_taken (docs/lab-04/specification.md sec 7.1 step 5).
--
-- The migration only ADDS objects, so undoing it is dropping exactly those
-- objects. This DESTROYS every Action Taken and Status History row and every
-- resolvedAt value; take a backup first:
--   pg_dump "$DATABASE_URL" --format=custom --file=toktickit-before-rollback.dump
-- Run:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/lab4-rollback.sql
-- Then check out the Lab 3 schema (git) and run `npx prisma generate`.
-- Lab 1-3 tables and rows are not touched.

BEGIN;

DROP TABLE IF EXISTS "ActionTaken";
DROP TABLE IF EXISTS "TicketStatusChange";
DROP TYPE IF EXISTS "ActionStatus";

DROP INDEX IF EXISTS "Ticket_currentStatus_ticketOwnerId_idx";
DROP INDEX IF EXISTS "Ticket_requesterId_currentStatus_idx";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "resolvedAt";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261028000001_lab4_actions_taken';

COMMIT;
