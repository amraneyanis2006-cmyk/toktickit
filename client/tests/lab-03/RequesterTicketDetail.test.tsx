import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TicketDetail from '../../src/pages/TicketDetail';
import { apiFetch } from '../../src/api/apiClient';

vi.mock('../../src/api/apiClient', async () => {
  const actual = await vi.importActual('../../src/api/apiClient');
  return { ...actual, apiFetch: vi.fn() };
});

const baseTicket = {
  id: 1,
  ticketNumber: 'TKT-2026-000001',
  category: { id: 1, name: 'Hardware' },
  relatedSystem: { id: 1, name: 'Corporate Laptop' },
  summary: 'Laptop battery drains quickly',
  description: 'Battery drains fast even when idle.',
  requestedPriority: 'MEDIUM' as const,
  itPriority: null,
  currentStatus: 'NEW' as const,
  requesterIndicatedResolved: false,
  createdAt: '2026-08-22T09:14:00.000Z',
  updatedAt: '2026-08-22T09:14:00.000Z',
  attachments: [],
  publicComments: [
    {
      id: 1,
      ticketId: 1,
      authorId: 7,
      authorName: 'Jennifer Anderson',
      authorRole: 'REQUESTER' as const,
      content: 'Thanks for looking into this.',
      createdAt: '2026-08-22T10:00:00.000Z',
    },
  ],
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/tickets/TKT-2026-000001']}>
      <Routes>
        <Route path="/tickets/:ticketNumber" element={<TicketDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RequesterTicketDetail - Public Comments + Problem Appears Resolved (UI-06)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the existing Public Comments thread', async () => {
    (apiFetch as any).mockResolvedValue(baseTicket);

    renderScreen();

    expect(await screen.findByText('Thanks for looking into this.')).toBeInTheDocument();
    expect(screen.getByText('Jennifer Anderson')).toBeInTheDocument();
  });

  it('posts a new comment and refreshes the thread', async () => {
    (apiFetch as any)
      .mockResolvedValueOnce(baseTicket) // initial load
      .mockResolvedValueOnce({ id: 2 }) // POST /comments
      .mockResolvedValueOnce({
        ...baseTicket,
        publicComments: [
          ...baseTicket.publicComments,
          {
            id: 2,
            ticketId: 1,
            authorId: 7,
            authorName: 'Jennifer Anderson',
            authorRole: 'REQUESTER',
            content: 'One more update.',
            createdAt: '2026-08-22T11:00:00.000Z',
          },
        ],
      }); // reload after posting

    renderScreen();
    await screen.findByText('Thanks for looking into this.');

    await userEvent.type(screen.getByPlaceholderText(/type your comment here/i), 'One more update.');
    await userEvent.click(screen.getByRole('button', { name: /post comment/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/tickets/TKT-2026-000001/comments',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ content: 'One more update.' }) })
      );
    });
    expect(await screen.findByText('One more update.')).toBeInTheDocument();
  });

  it('"Problem Appears Resolved" toggles to a confirmed, disabled state once used', async () => {
    (apiFetch as any)
      .mockResolvedValueOnce(baseTicket) // initial load
      .mockResolvedValueOnce({ ticketNumber: 'TKT-2026-000001', requesterIndicatedResolved: true }) // PATCH
      .mockResolvedValueOnce({ ...baseTicket, requesterIndicatedResolved: true }); // reload

    renderScreen();
    await screen.findByText('Thanks for looking into this.');

    const resolveButton = screen.getByRole('button', { name: /problem appears resolved/i });
    await userEvent.click(resolveButton);

    const confirmedButton = await screen.findByRole('button', { name: /you indicated this is resolved/i });
    expect(confirmedButton).toBeDisabled();
    // Never mistaken for the formal status badge - the Current Status badge is separate.
    expect(screen.getByText('NEW')).toBeInTheDocument();
  });
});
