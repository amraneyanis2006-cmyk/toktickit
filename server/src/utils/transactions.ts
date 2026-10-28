// Options for interactive transactions that take a ticket row lock (status
// change FOR UPDATE, Action Taken writes FOR SHARE). They may wait on that lock,
// so they get more room than Prisma's 5 s default.
export const LOCKING_TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };
