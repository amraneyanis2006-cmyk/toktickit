// Options for interactive transactions that take a ticket row lock (status
// change FOR NO KEY UPDATE, Action Taken writes FOR SHARE). `timeout` bounds the whole
// transaction, including a wait on that row lock (15 s, above Prisma's 5 s
// default); `maxWait` only bounds waiting for a pooled connection. A wait longer
// than `timeout` ends in Prisma P2028 and a generic 500 (known limitation).
import { Prisma } from '@prisma/client';

// READ COMMITTED is required, not just the default: every statement after the
// row lock gets a fresh snapshot, so the gate sees actions committed by a write
// that held the share lock before us (BR-12).
export const LOCKING_TX_OPTIONS = {
  maxWait: 10_000,
  timeout: 15_000,
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
};
