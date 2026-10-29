import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MyTickets from '../../src/pages/MyTickets';
import StaffTicketQueue from '../../src/pages/StaffTicketQueue';
import UserManagement from '../../src/pages/UserManagement';
import { apiFetch } from '../../src/api/apiClient';

vi.mock('../../src/api/apiClient', async () => {
  const actual = await vi.importActual('../../src/api/apiClient');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, name: 'Admin', email: 'admin@example.com', role: 'ADMINISTRATOR', mustChangePassword: false } }),
}));

const ACTIVE = 'NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED';
const page = { data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } };

/** Query string of the last list call to `prefix` (the list request, not /categories). */
function lastQuery(prefix: string) {
  const calls = (apiFetch as any).mock.calls.map((c: [string]) => c[0]).filter((p: string) => p.startsWith(`${prefix}?`) || p === prefix);
  return new URLSearchParams(calls[calls.length - 1].split('?')[1] ?? '');
}

const chip = () => screen.queryByText('Filtered from Dashboard');

describe('Drill-down filters (UI-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiFetch as any).mockImplementation((path: string) => Promise.resolve(path.startsWith('/admin/users') || path === '/categories' ? [] : page));
  });

  it('UI-05: My Tickets applies status list + resolvedWithinDays from the URL, shows the chip, and Clear Filters removes it', async () => {
    render(<MemoryRouter initialEntries={['/tickets?status=RESOLVED,CLOSED&resolvedWithinDays=7']}><MyTickets /></MemoryRouter>);
    await waitFor(() => expect(lastQuery('/tickets').get('status')).toBe('RESOLVED,CLOSED'));
    expect(lastQuery('/tickets').get('resolvedWithinDays')).toBe('7');
    expect(chip()).toBeInTheDocument();
    // The multi-status filter is shown in the status control, not as "All Statuses".
    const status = screen.getByLabelText('Filter by status') as HTMLSelectElement;
    expect(status.value).toBe('RESOLVED,CLOSED');
    expect(status.selectedOptions[0]!.textContent).toBe('Resolved, Closed');

    await userEvent.click(screen.getAllByRole('button', { name: 'Clear Filters' })[0]!);
    await waitFor(() => expect(lastQuery('/tickets').get('status')).toBeNull());
    expect(lastQuery('/tickets').get('resolvedWithinDays')).toBeNull();
    expect(chip()).not.toBeInTheDocument();
  });

  it('UI-05: the Ticket Queue applies ownership, status list, priority NONE and requesterResolved; removing the chip clears them', async () => {
    render(
      <MemoryRouter initialEntries={[`/staff/tickets?ownership=unassigned&status=${ACTIVE}&priority=NONE&requesterResolved=true`]}>
        <StaffTicketQueue />
      </MemoryRouter>
    );
    await waitFor(() => expect(lastQuery('/staff/tickets').get('ownership')).toBe('unassigned'));
    const q = lastQuery('/staff/tickets');
    expect(q.get('status')).toBe(ACTIVE);
    expect(q.get('priority')).toBe('NONE');
    expect(q.get('requesterResolved')).toBe('true');
    expect((screen.getByLabelText('Filter by priority') as HTMLSelectElement).selectedOptions[0]!.textContent).toBe('Not set');
    expect((screen.getByLabelText('Filter by status') as HTMLSelectElement).selectedOptions[0]!.textContent)
      .toBe('New, Open, In progress, Waiting for requester, Reopened');

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Filtered from Dashboard' }));
    await waitFor(() => expect(lastQuery('/staff/tickets').get('ownership')).toBeNull());
    expect(lastQuery('/staff/tickets').get('requesterResolved')).toBeNull();
    expect(lastQuery('/staff/tickets').get('status')).toBeNull();
    expect(chip()).not.toBeInTheDocument();
  });

  it('UI-05: User Management applies role and isActive from the URL and Clear removes them', async () => {
    window.history.replaceState(null, '', '/admin/users?role=IT_STAFF&isActive=true');
    render(<UserManagement />);
    // UserManagement also loads an unfiltered admin count, so look for the list request itself.
    const paths = () => (apiFetch as any).mock.calls.map((c: [string]) => c[0]);
    await waitFor(() => expect(paths()).toContain('/admin/users?role=IT_STAFF&isActive=true'));
    expect(screen.getByLabelText('Filter by role')).toHaveValue('IT_STAFF');
    expect(chip()).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: /^clear/i })[0]!);
    await waitFor(() => expect(paths()).toContain('/admin/users'));
    expect(chip()).not.toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('UI-05: without dashboard parameters there is no chip', async () => {
    render(<MemoryRouter initialEntries={['/staff/tickets']}><StaffTicketQueue /></MemoryRouter>);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(chip()).not.toBeInTheDocument();
  });
});
