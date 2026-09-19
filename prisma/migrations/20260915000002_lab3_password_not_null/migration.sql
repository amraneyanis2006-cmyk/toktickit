-- prisma/migrations/20260915000002_lab3_password_not_null/migration.sql
-- Step 2/2: run ONLY after scripts/migrate-lab2-passwords.ts has backfilled
-- every User row. If any row still has passwordHash IS NULL, this migration
-- fails loudly rather than silently locking someone out.

ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;
