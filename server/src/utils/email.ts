/**
 * Normalizes an email address for storage/comparison: trims surrounding
 * whitespace and lowercases it, so "Jennifer.Anderson@Example.com" and
 * "jennifer.anderson@example.com" are treated as the same address (BR-19).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
