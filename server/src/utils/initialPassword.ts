/**
 * Generates a system-issued initial password (BR-23): random, at least
 * 12 characters, never deterministic across calls. Used by
 * scripts/migrate-lab2-passwords.ts (its own copy) and by
 * POST /api/admin/users (Issue #19).
 */
export function generateInitialPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let pwd = '';
  for (let i = 0; i < 14; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}
