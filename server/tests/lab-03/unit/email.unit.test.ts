import { describe, it, expect } from 'vitest';
import { normalizeEmail } from '../../../src/utils/email';

describe('email normalization (UNIT-04)', () => {
  it('lowercases the email', () => {
    expect(normalizeEmail('Jennifer.Anderson@Example.com')).toBe('jennifer.anderson@example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  someone@example.com  ')).toBe('someone@example.com');
  });

  it('treats differently-cased addresses as the same normalized value', () => {
    expect(normalizeEmail('User@Example.com')).toBe(normalizeEmail('user@example.com'));
  });
});
