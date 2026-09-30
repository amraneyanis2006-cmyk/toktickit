import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StaffTicketDetail from '../../src/pages/StaffTicketDetail';
import UserManagement from '../../src/pages/UserManagement';
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
  summary: 'Field style test ticket',
  description: 'Fixture for STYLE-03.',
  requestedPriority: 'MEDIUM',
  itPriority: 'MEDIUM',
  currentStatus: 'IN_PROGRESS',
  requesterIndicatedResolved: false,
  createdAt: '2026-08-22T09:14:00.000Z',
  updatedAt: '2026-08-22T09:14:00.000Z',
  attachments: [],
  publicComments: [],
  internalNotes: [],
};

describe('Editable vs read-only field styling (STYLE-03)', () => {
  it('StaffTicketDetail: Ticket Number/Category/Related System/Requester/Summary/Description use zg-readonly-field', async () => {
    (apiFetch as any).mockResolvedValue(ticket);
    render(
      <MemoryRouter initialEntries={['/staff/tickets/TKT-2026-000001']}>
        <Routes>
          <Route path="/staff/tickets/:ticketNumber" element={<StaffTicketDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('TKT-2026-000001');
    expect(screen.getByText('TKT-2026-000001')).toHaveClass('zg-readonly-field');
    expect(screen.getByText('Hardware')).toHaveClass('zg-readonly-field');
    expect(screen.getByText('Corporate Laptop')).toHaveClass('zg-readonly-field');
    expect(screen.getByText('Sarah Johnson')).toHaveClass('zg-readonly-field');
    expect(screen.getByText('Field style test ticket')).toHaveClass('zg-readonly-field');
  });

  it('StaffTicketDetail: IT Priority and Current Status are real editable controls, not read-only fields', async () => {
    (apiFetch as any).mockResolvedValue(ticket);
    render(
      <MemoryRouter initialEntries={['/staff/tickets/TKT-2026-000001']}>
        <Routes>
          <Route path="/staff/tickets/:ticketNumber" element={<StaffTicketDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('TKT-2026-000001');
    const itPriority = screen.getByLabelText('IT Priority');
    const status = screen.getByLabelText('Current Status');

    expect(itPriority.tagName).toBe('SELECT');
    expect(itPriority).not.toBeDisabled();
    expect(itPriority).toHaveClass('form-select');
    expect(itPriority).not.toHaveClass('zg-readonly-field');

    expect(status.tagName).toBe('SELECT');
    expect(status).not.toBeDisabled();
    expect(status).toHaveClass('form-select');
  });

  it('UserManagement create panel: Full Name/Email/Role are real editable controls (form-control/form-select)', async () => {
    (apiFetch as any).mockResolvedValue([]);
    render(<UserManagement />);

    await screen.findByRole('button', { name: '+ Create User' });
    const user = (await import('@testing-library/user-event')).default;
    await user.click(screen.getByRole('button', { name: '+ Create User' }));

    const dialog = await screen.findByRole('dialog');
    const name = dialog.querySelector('#user-name')!;
    const email = dialog.querySelector('#user-email')!;
    const role = dialog.querySelector('#user-role')!;

    expect(name).toHaveClass('form-control');
    expect(name).not.toBeDisabled();
    expect(email).toHaveClass('form-control');
    expect(email).not.toBeDisabled();
    expect(role).toHaveClass('form-select');
    expect(role).not.toBeDisabled();
  });
});
