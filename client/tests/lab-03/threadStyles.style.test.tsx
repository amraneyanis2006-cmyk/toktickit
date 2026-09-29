import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StaffTicketDetail from '../../src/pages/StaffTicketDetail';
import { apiFetch } from '../../src/api/apiClient';

vi.mock('../../src/api/apiClient', async () => {
  const actual = await vi.importActual('../../src/api/apiClient');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'Staff One', email: 'staff@example.com', role: 'IT_STAFF', mustChangePassword: false },
    status: 'ready',
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const ticket = {
  id: 1,
  ticketNumber: 'TKT-2026-000001',
  requester: { id: 3, name: 'Sarah Johnson', email: 'sarah@example.com' },
  ticketOwner: null,
  category: { id: 1, name: 'Hardware' },
  relatedSystem: { id: 1, name: 'Corporate Laptop' },
  summary: 'Style test ticket',
  description: 'Fixture for STYLE-02.',
  requestedPriority: 'MEDIUM',
  itPriority: 'MEDIUM',
  currentStatus: 'IN_PROGRESS',
  requesterIndicatedResolved: false,
  createdAt: '2026-08-22T09:14:00.000Z',
  updatedAt: '2026-08-22T09:14:00.000Z',
  attachments: [],
  publicComments: [
    { id: 1, ticketId: 1, authorId: 3, authorName: 'Sarah Johnson', authorRole: 'REQUESTER', content: 'A public comment.', createdAt: '2026-08-22T09:30:00.000Z' },
  ],
  internalNotes: [
    { id: 1, ticketId: 1, authorId: 1, authorName: 'Staff One', content: 'An internal note.', createdAt: '2026-08-22T09:45:00.000Z' },
  ],
};

function renderScreen() {
  (apiFetch as any).mockResolvedValue(ticket);
  return render(
    <MemoryRouter initialEntries={['/staff/tickets/TKT-2026-000001']}>
      <Routes>
        <Route path="/staff/tickets/:ticketNumber" element={<StaffTicketDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Public Comments vs Internal Notes styling (STYLE-02)', () => {
  it('the Internal Notes block has its own distinct label, never present in the Public Comments thread', async () => {
    renderScreen();
    await screen.findByText('A public comment.');

    expect(screen.getByText(/internal - staff only/i)).toBeInTheDocument();
  });

  it('the Internal Notes container uses non-default background/border styling (never bare/unstyled)', async () => {
    renderScreen();
    await screen.findByText('An internal note.');

    const labelEl = screen.getByText(/internal - staff only/i);
    // The label text sits in its own inner <div> (color only); walk up to
    // the actual styled wrapper, identified by having a background-color.
    let container: HTMLElement | null = labelEl.closest('div');
    while (container && !(container.getAttribute('style') ?? '').match(/background-color/i)) {
      container = container.parentElement;
    }
    expect(container, 'No ancestor div with a background-color style was found').not.toBeNull();
    const style = container!.getAttribute('style') ?? '';

    expect(style).toMatch(/background-color/i);
    expect(style).toMatch(/border/i);
  });

  it('a Public Comment and an Internal Note are never inside the same container element', async () => {
    renderScreen();
    await screen.findByText('A public comment.');
    await screen.findByText('An internal note.');

    const publicComment = screen.getByText('A public comment.');
    const internalNote = screen.getByText('An internal note.');
    let internalBlock: HTMLElement | null = screen.getByText(/internal - staff only/i).closest('div');
    while (internalBlock && !(internalBlock.getAttribute('style') ?? '').match(/background-color/i)) {
      internalBlock = internalBlock.parentElement;
    }
    expect(internalBlock).not.toBeNull();

    expect(internalBlock!.contains(internalNote)).toBe(true);
    expect(internalBlock!.contains(publicComment)).toBe(false);
  });
});
