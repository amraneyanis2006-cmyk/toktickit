import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ChangePassword from '../../src/pages/ChangePassword';
import { apiFetch, ApiError } from '../../src/api/apiClient';

vi.mock('../../src/api/apiClient', async () => {
  const actual = await vi.importActual('../../src/api/apiClient');
  return { ...actual, apiFetch: vi.fn() };
});

const mockRefresh = vi.fn();
const mockLogout = vi.fn();

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'Sarah Johnson', email: 'sarah@example.com', role: 'REQUESTER', mustChangePassword: true },
    status: 'ready',
    login: vi.fn(),
    logout: mockLogout,
    refresh: mockRefresh,
  }),
}));

function renderScreen() {
  return render(
    <MemoryRouter>
      <ChangePassword />
    </MemoryRouter>
  );
}

describe('ChangePassword (UI-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders current, new, and confirm password fields', () => {
    renderScreen();
    expect(screen.getByLabelText(/current \(temporary\) password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  });

  it('rejects a new password shorter than 8 characters without calling the API', async () => {
    renderScreen();
    await userEvent.type(screen.getByLabelText(/current \(temporary\) password/i), 'TempPass1!');
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'short');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'short');
    await userEvent.click(screen.getByRole('button', { name: /save new password/i }));

    expect(await screen.findByText('Must be at least 8 characters.')).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('rejects mismatched confirmation without calling the API', async () => {
    renderScreen();
    await userEvent.type(screen.getByLabelText(/current \(temporary\) password/i), 'TempPass1!');
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'BrandNewPass1!');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'Different1!');
    await userEvent.click(screen.getByRole('button', { name: /save new password/i }));

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('on success, calls the API, refreshes the auth state, and navigates away', async () => {
    (apiFetch as any).mockResolvedValue({ id: 1, mustChangePassword: false });

    renderScreen();
    await userEvent.type(screen.getByLabelText(/current \(temporary\) password/i), 'TempPass1!');
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'BrandNewPass1!');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'BrandNewPass1!');
    await userEvent.click(screen.getByRole('button', { name: /save new password/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/auth/change-password',
        expect.objectContaining({
          body: JSON.stringify({ currentPassword: 'TempPass1!', newPassword: 'BrandNewPass1!' }),
        })
      );
    });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('shows a server-side field error under Current Password (e.g. wrong current password)', async () => {
    (apiFetch as any).mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', {
        currentPassword: 'Current password is incorrect.',
      })
    );

    renderScreen();
    await userEvent.type(screen.getByLabelText(/current \(temporary\) password/i), 'WrongPass1!');
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'BrandNewPass1!');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'BrandNewPass1!');
    await userEvent.click(screen.getByRole('button', { name: /save new password/i }));

    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument();
  });
});
