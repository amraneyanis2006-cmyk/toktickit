import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StaffTicketQueue from '../../src/pages/StaffTicketQueue';
import { apiFetch } from '../../src/api/apiClient';

vi.mock('../../src/api/apiClient', async () => {
  const actual = await vi.importActual('../../src/api/apiClient');
  return { ...actual, apiFetch: vi.fn() };
});

const sampleTicket = {
  id: 1,
  ticketNumber: 'TKT-2026-000001',
  summary: 'Laptop battery drains quickly',
  categoryName: 'Hardware',
  requestedPriority: 'MEDIUM' as const,
  itPriority: 'MEDIUM' as const,
  currentStatus: 'IN_PROGRESS',
  ticketOwner: { id: 3, name: 'Alex Kim' },
  createdAt: '2026-08-22T09:14:00.000Z',
  updatedAt: '2026-08-30T11:02:00.000Z',
};

function renderScreen() {
  return render(
    <MemoryRouter>
      <StaffTicketQueue />
    </MemoryRouter>
  );
}

describe('StaffTicketQueue (UI-03)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders search, filter, and pagination controls once data loads', async () => {
    (apiFetch as any).mockResolvedValue({
      data: [sampleTicket],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });

    renderScreen();

    expect((await screen.findAllByText('TKT-2026-000001')).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText(/search by ticket number or summary/i)).toBeInTheDocument();
    expect(screen.getAllByText('Alex Kim').length).toBeGreaterThan(0);
  });

  it('shows the empty state when there are no tickets at all', async () => {
    (apiFetch as any).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    });

    renderScreen();

    expect(await screen.findByText(/no tickets yet/i)).toBeInTheDocument();
  });

  it('shows a distinct no-results state (not the empty state) when filters yield nothing', async () => {
    (apiFetch as any).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    });

    renderScreen();
    await userEvent.type(screen.getByPlaceholderText(/search by ticket number or summary/i), 'nonexistent');

    await waitFor(() => {
      expect(screen.getByText(/no tickets match your filters/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/no tickets yet/i)).not.toBeInTheDocument();
  });

  it('sends the ownership=mine filter when selected', async () => {
    (apiFetch as any).mockResolvedValue({
      data: [sampleTicket],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });

    renderScreen();
    await screen.findAllByText('TKT-2026-000001');

    await userEvent.selectOptions(screen.getByDisplayValue(/all tickets/i), 'mine');

    await waitFor(() => {
      const lastCall = (apiFetch as any).mock.calls.at(-1)[0] as string;
      expect(lastCall).toContain('ownership=mine');
    });
  });

  it('shows a retry banner on API failure', async () => {
    (apiFetch as any).mockRejectedValue(new Error('network down'));

    renderScreen();

    expect(await screen.findByText(/unable to load tickets/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
