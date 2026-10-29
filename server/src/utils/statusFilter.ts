import { TicketStatus } from '@prisma/client';

const VALID = new Set<string>(Object.values(TicketStatus));

/**
 * `status` list filter of GET /api/tickets and GET /api/staff/tickets
 * (api-spec.md sec 7): one status or a comma-separated list. Absent/empty means
 * no filter; any unknown value (or a repeated `status=` parameter) is an error.
 */
export function parseStatusFilter(raw: unknown): { statuses?: TicketStatus[]; error?: string } {
  if (raw === undefined || raw === '') return {};
  const parts = typeof raw === 'string' ? raw.split(',').map((s) => s.trim()) : null;
  if (!parts || parts.some((s) => !VALID.has(s))) {
    return { error: 'status must be one or more of: ' + [...VALID].join(', ') + ' (comma-separated).' };
  }
  return { statuses: [...new Set(parts)] as TicketStatus[] };
}
