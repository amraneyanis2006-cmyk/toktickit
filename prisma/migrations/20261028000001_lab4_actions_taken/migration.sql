-- Lab 4 (Issue #61): Actions Taken, Status History, Ticket.resolvedAt.
-- ADDITIVE ONLY (docs/lab-04/specification.md sec 7.1): creates one enum, two
-- tables, one nullable column, and indexes. No Lab 1-3 object is dropped,
-- renamed, or retyped. Recovery: scripts/lab4-rollback.sql or a pg_dump restore.

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ActionTaken" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "actionAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "result" TEXT,
    "status" "ActionStatus" NOT NULL DEFAULT 'PLANNED',
    "performedById" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" TEXT,
    "attachmentNotes" TEXT,
    "clientRequestId" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketStatusChange" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "fromStatus" "TicketStatus" NOT NULL,
    "toStatus" "TicketStatus" NOT NULL,
    "changedById" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_actionAt_id_idx" ON "ActionTaken"("ticketId", "actionAt", "id");

-- CreateIndex
CREATE INDEX "ActionTaken_performedById_status_idx" ON "ActionTaken"("performedById", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ActionTaken_ticketId_clientRequestId_key" ON "ActionTaken"("ticketId", "clientRequestId");

-- CreateIndex
CREATE INDEX "TicketStatusChange_ticketId_changedAt_id_idx" ON "TicketStatusChange"("ticketId", "changedAt", "id");

-- CreateIndex
CREATE INDEX "Ticket_currentStatus_ticketOwnerId_idx" ON "Ticket"("currentStatus", "ticketOwnerId");

-- CreateIndex
CREATE INDEX "Ticket_requesterId_currentStatus_idx" ON "Ticket"("requesterId", "currentStatus");

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusChange" ADD CONSTRAINT "TicketStatusChange_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusChange" ADD CONSTRAINT "TicketStatusChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill (sec 7.1 step 2): best available evidence of the resolution time for
-- legacy Resolved/Closed Tickets. Same statement as
-- server/src/utils/resolvedAtBackfill.ts (MIG-02); re-running it is a no-op.
UPDATE "Ticket" SET "resolvedAt" = "updatedAt" WHERE "currentStatus" IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NULL;
