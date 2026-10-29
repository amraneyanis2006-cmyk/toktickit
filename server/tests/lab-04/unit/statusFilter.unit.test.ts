import { describe, it, expect } from 'vitest';
import { parseStatusFilter } from '../../../src/utils/statusFilter';

describe('Comma-separated status filter (api-spec sec 7)', () => {
  it('UNIT-05: parses one or many statuses and de-duplicates', () => {
    expect(parseStatusFilter('OPEN')).toEqual({ statuses: ['OPEN'] });
    expect(parseStatusFilter('NEW,OPEN,OPEN, IN_PROGRESS')).toEqual({ statuses: ['NEW', 'OPEN', 'IN_PROGRESS'] });
  });

  it('UNIT-05: no value means no filter', () => {
    expect(parseStatusFilter(undefined)).toEqual({});
    expect(parseStatusFilter('')).toEqual({});
  });

  it('UNIT-05: rejects any unknown value, single or in a list, with a fields.status error', () => {
    for (const raw of ['FOO', 'OPEN,FOO', 'open', 'OPEN,', ['OPEN', 'NEW'], 42]) {
      const result = parseStatusFilter(raw);
      expect(result.statuses, JSON.stringify(raw)).toBeUndefined();
      expect(result.error, JSON.stringify(raw)).toEqual(expect.any(String));
    }
  });
});
