import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StaffDashboard from '../../src/pages/StaffDashboard';
import { apiFetch } from '../../src/api/apiClient';

vi.mock('../../src/api/apiClient', async () => {
  const actual = await vi.importActual('../../src/api/apiClient');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 188, name: 'Alex Kim', email: 'alex.kim@example.com', role: 'IT_STAFF', mustChangePassword: false } }),
}));

const ACTIVE = 'NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED';

function data(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: '2026-10-28T09:00:00.000Z',
    windowDays: 7,
    metrics: {
      unassignedOpen: { value: 4, drillDown: `/staff/tickets?ownership=unassigned&status=${ACTIVE}` },
      myOpenTickets: { value: 6, drillDown: `/staff/tickets?ownership=mine&status=${ACTIVE}` },
      awaitingReview: { value: 1, drillDown: `/staff/tickets?requesterResolved=true&status=${ACTIVE}` },
      highPriorityOpen: { value: 3, drillDown: `/staff/tickets?priority=HIGH&status=${ACTIVE}` },
      myOpenActions: { value: 2, drillDown: '#my-open-actions' },
    },
    byStatus: { NEW: 2, OPEN: 1, IN_PROGRESS: 3, WAITING_FOR_REQUESTER: 1, RESOLVED: 2, CLOSED: 1, REOPENED: 1, CANCELLED: 9 },
    byItPriority: { LOW: 2, MEDIUM: 3, HIGH: 3, NONE: 7 },
    myOpenActionsList: [
      { id: 41, ticketNumber: 'TKT-2026-000002', ticketSummary: 'Cannot connect to campus Wi-Fi', description: 'Reset the Wi-Fi profile.',
        status: 'IN_PROGRESS', actionAt: '2026-10-28T03:15:00.000Z', followUpRequired: true },
    ],
    urgentTickets: [
      { ticketNumber: 'TKT-2026-000005', summary: 'Server room alarm', currentStatus: 'OPEN', itPriority: 'HIGH', ticketOwner: null, createdAt: '2026-10-20T03:15:00.000Z' },
    ],
    recentTickets: [{ ticketNumber: 'TKT-2026-000006', summary: 'Printer jam', currentStatus: 'NEW', updatedAt: '2026-10-28T08:00:00.000Z' }],
    ...overrides,
  };
}

function renderPage() {
  render(<MemoryRouter><StaffDashboard /></MemoryRouter>);
}

describe('StaffDashboard (UI-01)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UI-01: renders the API values with "View all" links named after the metric and pointing at the drill-down', async () => {
    (apiFetch as any).mockResolvedValue(data());
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back, Alex!' })).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/dashboard/staff');

    const unassigned = screen.getByRole('heading', { level: 2, name: 'Unassigned' }).closest('.zg-metric') as HTMLElement;
    expect(within(unassigned).getByText('4')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all unassigned tickets' })).toHaveAttribute('href', `/staff/tickets?ownership=unassigned&status=${ACTIVE}`);
    expect(screen.getByRole('link', { name: /view all my open tickets/i })).toHaveAttribute('href', `/staff/tickets?ownership=mine&status=${ACTIVE}`);
    expect(screen.getByRole('link', { name: /view all .*awaiting review/i })).toHaveAttribute('href', `/staff/tickets?requesterResolved=true&status=${ACTIVE}`);
    expect(screen.getByRole('link', { name: /view all high priority open/i })).toHaveAttribute('href', `/staff/tickets?priority=HIGH&status=${ACTIVE}`);
    expect(screen.getByRole('link', { name: /view all my open actions/i })).toHaveAttribute('href', '#my-open-actions');

    // Status chips and priority links are built by the client from the keys (api-spec sec 10).
    expect(screen.getByRole('link', { name: /cancelled.*9/i })).toHaveAttribute('href', '/staff/tickets?status=CANCELLED');
    expect(screen.getByRole('link', { name: /not set.*7/i })).toHaveAttribute('href', `/staff/tickets?priority=NONE&status=${ACTIVE}`);

    const actions = document.getElementById('my-open-actions') as HTMLElement;
    expect(within(actions).getByRole('link', { name: 'TKT-2026-000002' })).toHaveAttribute('href', '/staff/tickets/TKT-2026-000002');
    expect(within(actions).getByText('Follow-up')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TKT-2026-000005' })).toHaveAttribute('href', '/staff/tickets/TKT-2026-000005');
    expect(screen.getByText('Unassigned', { selector: 'li *' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'User Accounts' })).not.toBeInTheDocument();
  });

  it('UI-01: the User Accounts card (sent by the API to Administrators only) links to User Management filtered by role and status', async () => {
    (apiFetch as any).mockResolvedValue(data({ userAccounts: { activeRequesters: 5, activeItStaff: 3, activeAdministrators: 1, inactive: 2 } }));
    renderPage();
    const card = (await screen.findByRole('heading', { name: 'User Accounts' })).closest('.zg-card') as HTMLElement;
    expect(within(card).getByRole('link', { name: /active requesters.*5/i })).toHaveAttribute('href', '/admin/users?role=REQUESTER&isActive=true');
    expect(within(card).getByRole('link', { name: /active it staff.*3/i })).toHaveAttribute('href', '/admin/users?role=IT_STAFF&isActive=true');
    expect(within(card).getByRole('link', { name: /active administrators.*1/i })).toHaveAttribute('href', '/admin/users?role=ADMINISTRATOR&isActive=true');
    expect(within(card).getByRole('link', { name: /inactive.*2/i })).toHaveAttribute('href', '/admin/users?isActive=false');
  });

  it('UI-01: shows an aria-busy skeleton while loading, then the empty texts for zero values and empty lists', async () => {
    let resolve!: (v: unknown) => void;
    (apiFetch as any).mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPage();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    const zero = (d: ReturnType<typeof data>) => Object.fromEntries(Object.entries(d.metrics).map(([k, m]) => [k, { ...m, value: 0 }]));
    const empty = data();
    resolve({ ...empty, metrics: zero(empty), myOpenActionsList: [], urgentTickets: [], recentTickets: [] });
    expect(await screen.findByText('No unassigned tickets.')).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.getByText('You have no open actions.')).toHaveClass('zg-callout-neutral');
    expect(screen.getByText('No urgent tickets.')).toBeInTheDocument();
    expect(screen.getByText('No ticket was updated in the last 7 days.')).toBeInTheDocument();
    expect(screen.getAllByText('Nothing here').length).toBeGreaterThan(0);
  });

  it('UI-01: a failure shows the safe message and Retry recovers; Refresh reloads', async () => {
    (apiFetch as any).mockRejectedValueOnce(new Error('network')).mockResolvedValue(data());
    renderPage();
    expect((await screen.findByText("We couldn't load your dashboard.")).closest('.zg-callout-error')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'View all unassigned tickets' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Refresh dashboard' }));
    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(await screen.findByText(/updated at/i)).toBeInTheDocument();
  });
});
