// Options for interactive transactions that take a ticket row lock (status
// change FOR NO KEY UPDATE, Action Taken writes FOR SHARE). `timeout` bounds the whole
// transaction, including a wait on that row lock (15 s, above Prisma's 5 s
// default); `maxWait` only bounds waiting for a pooled connection. A wait longer
// than `timeout` ends in Prisma P2028 and a generic 500 (known limitation).
export const LOCKING_TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };
