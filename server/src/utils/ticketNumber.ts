import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function generateTicketNumber(): Promise<string> {
  const year = new Date().getFullYear();

  const updated = await prisma.ticketSequence.upsert({
    where: { year },
    create: { year, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });

  const paddedSequence = String(updated.lastSeq).padStart(6, '0');
  return `TKT-${year}-${paddedSequence}`;
}