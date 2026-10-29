import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StaffTicketDetail from '../../src/pages/StaffTicketDetail';
import { apiFetch, ApiError } from '../../src/api/apiClient';

vi.mock('../../src/api/apiClient', async () => {
  const actual = await vi.importActual('../../src/api/apiClient');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 188, name: 'Alex Kim', email: 'alex.kim@example.com', role: 'IT_STAFF', mustChangePassword: false },
    status: 'ready', login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
  }),
}));

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, ticketNumber: 'TKT-2026-000001',
    requester: { id: 3, name: 'Sarah Johnson', email: 'sarah@example.com' },
    ticketOwner: { id: 188, name: 'Alex Kim' },
    category: { id: 1, name: 'Hardware' }, relatedSystem: { id: 1, name: 'Corporate Laptop' },
    summary: 'Laptop battery drains quickly', description: 'Battery drains fast even when idle.',
    requestedPriority: 'MEDIUM', itPriority: 'MEDIUM', currentStatus: 'IN_PROGRESS',
    requesterIndicatedResolved: false, resolvedAt: null,
    createdAt: '2026-08-22T09:14:00.000Z', updatedAt: '2026-08-22T10:00:00.000Z',
    attachments: [], publicComments: [], internalNotes: [], actionsTaken: [], statusHistory: [],
    resolutionGate: { canResolve: true, blockers: [] },
    legalNextStatuses: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
    ...overrides,
  };
}

/** GET returns tickets[0] until a PATCH succeeds, then tickets[1]. */
function setup(tickets: ReturnType<typeof ticket>[], patch: () => Promise<unknown> = () => Promise.resolve({})) {
  let current = 0;
  (apiFetch as any).mockImplementation((path: string, opts?: { method?: string }) => {
    if (path === '/staff/users') return Promise.resolve([{ id: 188, name: 'Alex Kim' }]);
    if (opts?.method === 'PATCH') return patch().then((r) => { current = Math.min(current + 1, tickets.length - 1); return r; });
    return Promise.resolve(tickets[current]);
  });
  render(
    <MemoryRouter initialEntries={['/staff/tickets/TKT-2026-000001']}>
      <Routes><Route path="/staff/tickets/:ticketNumber" element={<StaffTicketDetail />} /></Routes>
    </MemoryRouter>
  );
}

const statusCalls = () => (apiFetch as any).mock.calls.filter((c: [string, { method?: string }?]) => c[0].endsWith('/status') && c[1]?.method === 'PATCH');

describe('TicketWorkflow (UI-04)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UI-04: offers only the legal targets, with Resolved disabled and the gate reason when blocked', async () => {
    setup([ticket({ resolutionGate: { canResolve: false, blockers: ['OPEN_ACTIONS'] } })]);
    const select = await screen.findByLabelText(/current status/i);
    const options = within(select).getAllByRole('option') as HTMLOptionElement[];
    expect(options.slice(1).map((o) => o.value)).toEqual(['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED']);
    expect(options.find((o) => o.value === 'RESOLVED')!.disabled).toBe(true);
    expect(screen.getByText('To resolve, complete at least one action and close all open actions.')).toBeInTheDocument();
  });

  it('UI-04: an unowned ticket gives the "Assign a Ticket Owner first." reason', async () => {
    setup([ticket({ ticketOwner: null, resolutionGate: { canResolve: false, blockers: ['UNASSIGNED', 'NO_COMPLETED_ACTION'] } })]);
    expect(await screen.findByText('Assign a Ticket Owner first.')).toBeInTheDocument();
  });

  it('UI-04: a RESOLUTION_BLOCKED rejection shows the server message, resets the select and reloads', async () => {
    setup([ticket()], () => Promise.reject(new ApiError(409, 'RESOLUTION_BLOCKED', 'This ticket cannot be resolved yet: complete or cancel the open actions.')));
    await userEvent.selectOptions(await screen.findByLabelText(/current status/i), 'RESOLVED');
    expect(await screen.findByText(/cannot be resolved yet: complete or cancel the open actions/i)).toHaveClass('zg-callout-error');
    expect(screen.getByLabelText(/current status/i)).toHaveValue('');
    const gets = (apiFetch as any).mock.calls.filter((c: [string, unknown?]) => c[0] === '/staff/tickets/TKT-2026-000001' && !c[1]);
    expect(gets.length).toBeGreaterThanOrEqual(2);
  });

  it('UI-04: success sends expectedUpdatedAt and refreshes badge, resolved date, history and the success callout', async () => {
    const resolved = ticket({
      currentStatus: 'RESOLVED', resolvedAt: '2026-08-23T08:00:00.000Z', updatedAt: '2026-08-23T08:00:00.000Z',
      legalNextStatuses: ['CLOSED', 'REOPENED'],
      statusHistory: [{ id: 7, fromStatus: 'IN_PROGRESS', toStatus: 'RESOLVED', changedBy: { id: 188, name: 'Alex Kim' }, changedAt: '2026-08-23T08:00:00.000Z' }],
    });
    setup([ticket(), resolved]);
    await userEvent.selectOptions(await screen.findByLabelText(/current status/i), 'RESOLVED');

    expect(await screen.findByRole('status')).toHaveTextContent('Status changed to Resolved.');
    expect(JSON.parse(statusCalls()[0][1].body)).toEqual({ currentStatus: 'RESOLVED', expectedUpdatedAt: '2026-08-22T10:00:00.000Z' });
    expect(screen.getByText('RESOLVED', { selector: '.zg-badge' })).toBeInTheDocument();
    expect(screen.getByText(/resolved on/i)).toBeInTheDocument();
    const history = screen.getByRole('list', { name: /status history/i });
    expect(within(history).getByText(/in progress → resolved/i)).toBeInTheDocument();
  });

  it('UI-04: the awaiting-review banner shows when the Requester says resolved on an active ticket', async () => {
    setup([ticket({ requesterIndicatedResolved: true })]);
    expect(await screen.findByText('The requester says the problem appears resolved. Review the actions before resolving.')).toHaveClass('zg-callout-info');
    expect(screen.getByText('Requester says resolved')).toHaveClass('zg-badge-awaiting-review');
  });

  it('UI-04: the cancel dialog mentions open actions only when there are some, and the actions reload after the cancel', async () => {
    const openAction = {
      id: 4, ticketNumber: 'TKT-2026-000001', actionAt: '2026-08-22T09:30:00.000Z', description: 'Order a new battery', result: null,
      status: 'PLANNED', performedBy: { id: 188, name: 'Alex Kim' }, createdBy: { id: 188, name: 'Alex Kim' },
      followUpRequired: false, followUpNote: null, attachmentNotes: null, completedAt: null, cancelledAt: null,
      createdAt: '2026-08-22T09:30:00.000Z', updatedAt: '2026-08-22T09:30:00.000Z',
    };
    const cancelled = ticket({ currentStatus: 'CANCELLED', legalNextStatuses: [], actionsTaken: [{ ...openAction, status: 'CANCELLED' }] });
    setup([ticket({ actionsTaken: [openAction] }), cancelled]);
    await userEvent.selectOptions(await screen.findByLabelText(/current status/i), 'CANCELLED');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('This also cancels 1 open action.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /yes, cancel ticket/i }));
    await waitFor(() => expect(statusCalls()).toHaveLength(1));
    await waitFor(() => expect(within(screen.getByRole('table')).getByText('Cancelled')).toBeInTheDocument());

    cleanup();
    vi.clearAllMocks();
    setup([ticket()]);
    await userEvent.selectOptions(await screen.findByLabelText(/current status/i), 'CANCELLED');
    expect(within(screen.getByRole('dialog')).queryByText(/also cancels/i)).not.toBeInTheDocument();
  });
});
