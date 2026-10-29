import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RequesterDashboard from '../../src/pages/RequesterDashboard';
import { apiFetch } from '../../src/api/apiClient';

vi.mock('../../src/api/apiClient', async () => {
  const actual = await vi.importActual('../../src/api/apiClient');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 3, name: 'Sarah Johnson', email: 'sarah@example.com', role: 'REQUESTER', mustChangePassword: false } }),
}));

const ticketItem = (n: number, status: string, summary: string) => ({
  ticketNumber: `TKT-2026-00000${n}`, summary, currentStatus: status, updatedAt: '2026-10-27T10:00:00.000Z',
});

function data(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: '2026-10-28T09:00:00.000Z',
    windowDays: 7,
    metrics: {
      openTickets: { value: 3, drillDown: '/tickets?status=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED' },
      waitingForMe: { value: 1, drillDown: '/tickets?status=WAITING_FOR_REQUESTER' },
      resolvedLast7Days: { value: 2, drillDown: '/tickets?status=RESOLVED,CLOSED&resolvedWithinDays=7' },
      closedTickets: { value: 12, drillDown: '/tickets?status=CLOSED' },
    },
    attentionTickets: [ticketItem(3, 'WAITING_FOR_REQUESTER', 'Need software license reactivated')],
    recentTickets: [ticketItem(4, 'OPEN', 'Laptop battery drains quickly')],
    ...overrides,
  };
}

function renderPage() {
  render(<MemoryRouter><RequesterDashboard /></MemoryRouter>);
}

describe('RequesterDashboard (UI-02)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('UI-02: shows the 4 cards with API values and drill-downs, the attention and recent lists, and quick actions', async () => {
    (apiFetch as any).mockResolvedValue(data());
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome, Sarah!' })).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/dashboard/requester');

    expect(document.querySelectorAll('.zg-metric')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'View all open tickets' })).toHaveAttribute('href', '/tickets?status=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED');
    expect(screen.getByRole('link', { name: /view all .*waiting for you/i })).toHaveAttribute('href', '/tickets?status=WAITING_FOR_REQUESTER');
    expect(screen.getByRole('link', { name: /view all .*resolved \(last 7 days\)/i })).toHaveAttribute('href', '/tickets?status=RESOLVED,CLOSED&resolvedWithinDays=7');
    expect(screen.getByRole('link', { name: /view all .*closed/i })).toHaveAttribute('href', '/tickets?status=CLOSED');
    const waiting = screen.getByRole('heading', { level: 2, name: 'Waiting for You' }).closest('.zg-metric') as HTMLElement;
    expect(waiting).toHaveClass('zg-metric-attention');
    expect(within(waiting).getByText('1')).toBeInTheDocument();

    const attention = screen.getByRole('heading', { name: 'Needs Your Attention' }).closest('.zg-card') as HTMLElement;
    expect(within(attention).getByText('IT Staff are waiting for your reply')).toBeInTheDocument();
    expect(within(attention).getByRole('link', { name: 'TKT-2026-000003' })).toHaveAttribute('href', '/tickets/TKT-2026-000003');
    expect(within(attention).getByText('Need software license reactivated')).toHaveAttribute('title', 'Need software license reactivated');
    const recent = screen.getByRole('heading', { name: 'Recently Updated' }).closest('.zg-card') as HTMLElement;
    expect(within(recent).getByRole('link', { name: 'TKT-2026-000004' })).toHaveAttribute('href', '/tickets/TKT-2026-000004');

    expect(screen.getByRole('link', { name: 'Create Ticket' })).toHaveAttribute('href', '/tickets/new');
    expect(screen.getByRole('link', { name: 'View My Tickets' })).toHaveAttribute('href', '/tickets');
  });

  it('UI-02: a Requester with no tickets sees zeros and the empty texts', async () => {
    const empty = data();
    const metrics = Object.fromEntries(Object.entries(empty.metrics).map(([k, m]) => [k, { ...m, value: 0 }]));
    (apiFetch as any).mockResolvedValue({ ...empty, metrics, attentionTickets: [], recentTickets: [] });
    renderPage();
    expect(await screen.findByText('Nothing needs your attention right now.')).toHaveClass('zg-callout-neutral');
    expect(screen.getByText("You haven't created any tickets yet.")).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(4);
    const waiting = screen.getByRole('heading', { level: 2, name: 'Waiting for You' }).closest('.zg-metric') as HTMLElement;
    expect(waiting).not.toHaveClass('zg-metric-attention');
  });

  it('UI-02: a failure shows the safe message and Retry recovers', async () => {
    (apiFetch as any).mockRejectedValueOnce(new Error('network')).mockResolvedValue(data());
    renderPage();
    expect((await screen.findByText("We couldn't load your dashboard.")).closest('.zg-callout-error')).not.toBeNull();
    expect(screen.queryByText('Needs Your Attention')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'View all open tickets' })).toBeInTheDocument();
  });
});
