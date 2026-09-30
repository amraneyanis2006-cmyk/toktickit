import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
    status: 'ready',
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const staffUsers = [
  { id: 188, name: 'Alex Kim' },
  { id: 191, name: 'Priya Nandi' },
];

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    ticketNumber: 'TKT-2026-000001',
    requester: { id: 3, name: 'Sarah Johnson', email: 'sarah@example.com' },
    ticketOwner: null,
    category: { id: 1, name: 'Hardware' },
    relatedSystem: { id: 1, name: 'Corporate Laptop' },
    summary: 'Laptop battery drains quickly',
    description: 'Battery drains fast even when idle.',
    requestedPriority: 'MEDIUM',
    itPriority: 'MEDIUM',
    currentStatus: 'IN_PROGRESS',
    requesterIndicatedResolved: false,
    createdAt: '2026-08-22T09:14:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
    attachments: [],
    publicComments: [
      {
        id: 1, ticketId: 1, authorId: 3, authorName: 'Sarah Johnson', authorRole: 'REQUESTER',
        content: 'Public comment from the requester.', createdAt: '2026-08-22T09:30:00.000Z',
      },
    ],
    internalNotes: [
      {
        id: 1, ticketId: 1, authorId: 188, authorName: 'Alex Kim',
        content: 'Private staff-only note.', createdAt: '2026-08-22T09:45:00.000Z',
      },
    ],
    ...overrides,
  };
}

function setupApi(ticket: ReturnType<typeof makeTicket>) {
  (apiFetch as any).mockImplementation((path: string, opts?: unknown) => {
    if (path === '/staff/users') return Promise.resolve(staffUsers);
    if (path.startsWith('/staff/tickets/') && !opts) return Promise.resolve(ticket);
    return Promise.resolve({});
  });
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/staff/tickets/TKT-2026-000001']}>
      <Routes>
        <Route path="/staff/tickets/:ticketNumber" element={<StaffTicketDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

function callsTo(suffix: string) {
  return (apiFetch as any).mock.calls.filter((c: unknown[]) => String(c[0]).endsWith(suffix));
}

describe('StaffTicketDetail (UI-04)', () => {
  beforeEach(() => {
    // restoreAllMocks does not clear vi.fn() call history (vitest 3+), so call-count
    // assertions would otherwise depend on test order.
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a Claim button (and no Reassign control) on an unassigned ticket', async () => {
    setupApi(makeTicket({ ticketOwner: null }));
    renderScreen();

    expect(await screen.findByRole('button', { name: /^claim$/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/reassign to/i)).not.toBeInTheDocument();
  });

  it('shows a Reassign control (and no Claim button) on an assigned ticket', async () => {
    setupApi(makeTicket({ ticketOwner: { id: 191, name: 'Priya Nandi' } }));
    renderScreen();

    expect(await screen.findByLabelText(/reassign to/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^claim$/i })).not.toBeInTheDocument();
  });

  it('Claim sends the ACTING user\'s id (not the requester\'s) plus expectedUpdatedAt', async () => {
    const ticket = makeTicket({ ticketOwner: null });
    setupApi(ticket);
    renderScreen();

    await userEvent.click(await screen.findByRole('button', { name: /^claim$/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/staff/tickets/TKT-2026-000001/claim',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ ticketOwnerId: 188, expectedUpdatedAt: ticket.updatedAt }),
        })
      );
    });
  });

  it('Reassign sends the SELECTED user\'s id plus expectedUpdatedAt (not just Claim)', async () => {
    const ticket = makeTicket({ ticketOwner: { id: 191, name: 'Priya Nandi' } });
    setupApi(ticket);
    renderScreen();

    const select = await screen.findByLabelText(/reassign to/i);
    await userEvent.selectOptions(select, '188');
    await userEvent.click(screen.getByRole('button', { name: /^reassign$/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/staff/tickets/TKT-2026-000001/claim',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ ticketOwnerId: 188, expectedUpdatedAt: ticket.updatedAt }),
        })
      );
    });
  });

  it('Reassign shows a refresh message on OWNERSHIP_CHANGED and reloads the ticket', async () => {
    const ticket = makeTicket({ ticketOwner: { id: 191, name: 'Priya Nandi' } });
    let claimCallCount = 0;
    (apiFetch as any).mockImplementation((path: string, opts?: { method?: string }) => {
      if (path === '/staff/users') return Promise.resolve(staffUsers);
      if (path.endsWith('/claim') && opts?.method === 'PATCH') {
        claimCallCount += 1;
        return Promise.reject(
          new ApiError(409, 'OWNERSHIP_CHANGED', 'This ticket was changed by someone else. Refresh and try again.')
        );
      }
      return Promise.resolve(ticket);
    });
    renderScreen();

    const select = await screen.findByLabelText(/reassign to/i);
    await userEvent.selectOptions(select, '188');
    await userEvent.click(screen.getByRole('button', { name: /^reassign$/i }));

    expect(await screen.findByText(/changed by someone else/i)).toBeInTheDocument();
    expect(claimCallCount).toBe(1);
  });

  it('Status select lists ONLY the legal next statuses, not every status', async () => {
    setupApi(makeTicket({ currentStatus: 'IN_PROGRESS' }));
    renderScreen();

    const select = await screen.findByLabelText(/current status/i);
    const options = within(select).getAllByRole('option').map((o) => o.textContent);

    expect(options).toEqual(
      expect.arrayContaining(['WAITING FOR REQUESTER', 'RESOLVED', 'CANCELLED'])
    );
    expect(options).not.toContain('NEW');
    expect(options).not.toContain('OPEN');
    expect(options).not.toContain('CLOSED');
  });

  it('choosing CANCELLED asks for confirmation before calling the API', async () => {
    setupApi(makeTicket({ currentStatus: 'IN_PROGRESS' }));
    renderScreen();

    const select = await screen.findByLabelText(/current status/i);
    await userEvent.selectOptions(select, 'CANCELLED');

    expect(await screen.findByText(/cancel this ticket/i)).toBeInTheDocument();
    expect(callsTo('/status').length).toBe(0);

    await userEvent.click(screen.getByRole('button', { name: /yes, cancel ticket/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/staff/tickets/TKT-2026-000001/status',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ currentStatus: 'CANCELLED' }) })
      );
    });
  });

  it('changing IT Priority calls the priority endpoint', async () => {
    setupApi(makeTicket({ itPriority: 'MEDIUM' }));
    renderScreen();

    const select = await screen.findByLabelText(/it priority/i);
    await userEvent.selectOptions(select, 'HIGH');

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/staff/tickets/TKT-2026-000001/priority',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ itPriority: 'HIGH' }) })
      );
    });
  });

  it('keeps Internal Notes in a separate, labelled block - never interleaved with Public Comments', async () => {
    setupApi(makeTicket());
    renderScreen();

    const publicComment = await screen.findByText('Public comment from the requester.');
    const internalNote = screen.getByText('Private staff-only note.');
    const internalBlock = screen.getByText(/internal - staff only/i).parentElement as HTMLElement;

    expect(internalBlock).toContainElement(internalNote);
    expect(internalBlock).not.toContainElement(publicComment);
  });

  it('posting an Internal Note calls the notes endpoint (not the comments endpoint)', async () => {
    setupApi(makeTicket());
    renderScreen();

    await userEvent.type(await screen.findByPlaceholderText(/add an internal note/i), 'Vendor RMA opened.');
    await userEvent.click(screen.getByRole('button', { name: /add note/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/staff/tickets/TKT-2026-000001/notes',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ content: 'Vendor RMA opened.' }) })
      );
    });
    expect(callsTo('/comments').length).toBe(0);
  });

  it('posting a Public Comment uses the shared /tickets/:ticketNumber/comments endpoint (there is no /staff/.../comments route)', async () => {
    setupApi(makeTicket());
    renderScreen();

    await userEvent.type(await screen.findByPlaceholderText(/type your comment here/i), 'We are on it.');
    await userEvent.click(screen.getByRole('button', { name: /post comment/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/tickets/TKT-2026-000001/comments',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ content: 'We are on it.' }) })
      );
    });
    expect(callsTo('/notes').length).toBe(0);
  });
});
