import { describe, it, expect } from 'vitest';
import { generateInitialPassword } from '../../../src/utils/initialPassword';

describe('initial password generator (UNIT-03)', () => {
  it('produces a string of at least 12 characters', () => {
    const pwd = generateInitialPassword();
    expect(typeof pwd).toBe('string');
    expect(pwd.length).toBeGreaterThanOrEqual(12);
  });

  it('is never deterministic across calls', () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generateInitialPassword()));
    expect(passwords.size).toBe(20);
  });
});
