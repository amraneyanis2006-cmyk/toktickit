import { randomInt } from 'crypto';

/**
 * Generates a system-issued initial password (BR-23): random, at least
 * 12 characters, never deterministic across calls. Uses crypto.randomInt
 * (a CSPRNG), not Math.random, because these values are real credentials.
 * Used by POST /api/admin/users and PATCH /api/admin/users/:id/reset-password.
 */
export function generateInitialPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let pwd = '';
  for (let i = 0; i < 14; i++) {
    pwd += chars[randomInt(chars.length)];
  }
  return pwd;
}
