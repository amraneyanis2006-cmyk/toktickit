import { describe, it, expect } from 'vitest';
import { normalizePagination } from '../../src/utils/validation';

describe('normalizePagination (UNIT-05)', () => {
  it('falls back to page=1 for invalid page values', () => {
    expect(normalizePagination({ page: -1, pageSize: 10 }).page).toBe(1);
    expect(normalizePagination({ page: 0, pageSize: 10 }).page).toBe(1);
    expect(normalizePagination({ page: 'abc', pageSize: 10 }).page).toBe(1);
    expect(normalizePagination({ page: 1.5, pageSize: 10 }).page).toBe(1);
  });

  it('falls back to pageSize=10 for invalid pageSize values', () => {
    expect(normalizePagination({ page: 1, pageSize: 0 }).pageSize).toBe(10);
    expect(normalizePagination({ page: 1, pageSize: 999 }).pageSize).toBe(10);
    expect(normalizePagination({ page: 1, pageSize: -5 }).pageSize).toBe(10);
    expect(normalizePagination({ page: 1, pageSize: 'abc' }).pageSize).toBe(10);
  });

  it('passes through valid pageSize of 20 or 50', () => {
    expect(normalizePagination({ page: 1, pageSize: 20 }).pageSize).toBe(20);
    expect(normalizePagination({ page: 1, pageSize: 50 }).pageSize).toBe(50);
  });

  it('passes through a valid page number greater than 1', () => {
    expect(normalizePagination({ page: 3, pageSize: 10 }).page).toBe(3);
  });

  it('defaults to page=1, pageSize=10 when nothing is provided', () => {
    expect(normalizePagination({})).toEqual({ page: 1, pageSize: 10 });
  });
});