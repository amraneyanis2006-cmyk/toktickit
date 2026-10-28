import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

// The resolvedAt backfill of the Lab 4 migration (specification.md sec 7.1
// step 2), exported so it can be re-run and tested (MIG-02). The migration file
// contains exactly this statement; MIG-02 checks the two never diverge.
export const RESOLVED_AT_BACKFILL_SQL =
  `UPDATE "Ticket" SET "resolvedAt" = "updatedAt" WHERE "currentStatus" IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NULL`;

/**
 * Sets resolvedAt = updatedAt on Resolved/Closed Tickets that have none. Raw
 * SQL on purpose: a Prisma update would also bump updatedAt. Pass ticketIds to
 * limit it (tests); omit them to run it on every Ticket. Returns the row count;
 * a second run returns 0.
 */
export async function backfillResolvedAt(db: PrismaClient, ticketIds?: number[]): Promise<number> {
  if (!ticketIds) return db.$executeRawUnsafe(RESOLVED_AT_BACKFILL_SQL);
  if (ticketIds.length === 0) return 0;
  return db.$executeRaw`${Prisma.raw(RESOLVED_AT_BACKFILL_SQL)} AND "id" IN (${Prisma.join(ticketIds)})`;
}
