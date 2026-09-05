import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock() below is hoisted above regular variable declarations by Vitest,
// so upsertMock must be created via vi.hoisted() to be visible inside it.
const { upsertMock } = vi.hoisted(() => {
  return { upsertMock: vi.fn() };
});

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: vi.fn().mockImplementation(function (this: any) {
      this.ticketSequence = { upsert: upsertMock };
    }),
  };
});

// Import AFTER the mock so ticketNumber.ts picks up the mocked PrismaClient.
import { generateTicketNumber } from '../../src/utils/ticketNumber';

describe('generateTicketNumber', () => {
  beforeEach(() => {
    upsertMock.mockReset();
  });

  it('UNIT-01: returns TKT-{YYYY}-{6 digits}, zero-padded', async () => {
    const year = new Date().getFullYear();
    upsertMock.mockResolvedValueOnce({ year, lastSeq: 7 });

    const result = await generateTicketNumber();

    expect(result).toBe(`TKT-${year}-000007`);
    expect(result).toMatch(/^TKT-\d{4}-\d{6}$/);
  });

  it('UNIT-01: pads a large sequence number to exactly 6 digits', async () => {
    const year = new Date().getFullYear();
    upsertMock.mockResolvedValueOnce({ year, lastSeq: 123456 });

    const result = await generateTicketNumber();

    expect(result).toBe(`TKT-${year}-123456`);
  });

  it('UNIT-02: two consecutive generations never collide', async () => {
    const year = new Date().getFullYear();
    upsertMock
      .mockResolvedValueOnce({ year, lastSeq: 10 })
      .mockResolvedValueOnce({ year, lastSeq: 11 });

    const first = await generateTicketNumber();
    const second = await generateTicketNumber();

    expect(first).not.toBe(second);
    expect(first).toBe(`TKT-${year}-000010`);
    expect(second).toBe(`TKT-${year}-000011`);
  });
});