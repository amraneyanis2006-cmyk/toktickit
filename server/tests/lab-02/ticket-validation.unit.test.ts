import { describe, it, expect } from 'vitest';
import { validateTicketFields } from '../../src/utils/validation';

describe('validateTicketFields (UNIT-03)', () => {
  it('rejects a Summary under 5 characters', () => {
    const errors = validateTicketFields({ summary: 'Hi', description: 'A valid description here.' });
    expect(errors.summary).toBeDefined();
  });

  it('rejects a Summary over 150 characters', () => {
    const errors = validateTicketFields({ summary: 'A'.repeat(151), description: 'A valid description here.' });
    expect(errors.summary).toBeDefined();
  });

  it('accepts a Summary between 5 and 150 characters', () => {
    const errors = validateTicketFields({ summary: 'Printer not working', description: 'A valid description here.' });
    expect(errors.summary).toBeUndefined();
  });

  it('rejects a Description under 10 characters', () => {
    const errors = validateTicketFields({ summary: 'Valid summary here', description: 'short' });
    expect(errors.description).toBeDefined();
  });

  it('rejects a Description over 2000 characters', () => {
    const errors = validateTicketFields({ summary: 'Valid summary here', description: 'A'.repeat(2001) });
    expect(errors.description).toBeDefined();
  });

  it('trims whitespace before checking length (still invalid if too short after trim)', () => {
    const errors = validateTicketFields({ summary: '   Hi   ', description: 'A valid description here.' });
    expect(errors.summary).toBeDefined(); // "Hi" trimmed is only 2 chars
  });

  it('trims whitespace before checking length (valid if long enough after trim)', () => {
    const errors = validateTicketFields({
      summary: '   Printer not connecting   ',
      description: '   The printer will not respond to any print jobs at all.   ',
    });
    expect(errors.summary).toBeUndefined();
    expect(errors.description).toBeUndefined();
  });

  it('rejects both fields at once when both are missing', () => {
    const errors = validateTicketFields({});
    expect(errors.summary).toBeDefined();
    expect(errors.description).toBeDefined();
  });

  it('returns no errors for fully valid input', () => {
    const errors = validateTicketFields({
      summary: 'Printer not connecting to network',
      description: 'The printer on the 3rd floor is not responding to any print jobs.',
    });
    expect(errors).toEqual({});
  });
});