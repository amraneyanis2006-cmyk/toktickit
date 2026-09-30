import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../../src/utils/password';

describe('password hashing helper (UNIT-01)', () => {
  it('hash differs from the plaintext password', async () => {
    const hash = await hashPassword('SomePlaintext123!');
    expect(hash).not.toBe('SomePlaintext123!');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('verifyPassword round-trips correctly', async () => {
    const hash = await hashPassword('SomePlaintext123!');
    await expect(verifyPassword('SomePlaintext123!', hash)).resolves.toBe(true);
    await expect(verifyPassword('WrongPassword', hash)).resolves.toBe(false);
  });

  it('produces a different hash each time (bcrypt salting)', async () => {
    const hash1 = await hashPassword('SomePlaintext123!');
    const hash2 = await hashPassword('SomePlaintext123!');
    expect(hash1).not.toBe(hash2);
  });
});
