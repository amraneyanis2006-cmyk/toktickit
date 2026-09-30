import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from '../../src/pages/Login';

const mockLogin = vi.fn();

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    status: 'ready',
    login: mockLogin,
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

function renderScreen() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe('Login (UI-01)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders email and password fields', () => {
    renderScreen();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it('disables the submit button while the request is in flight', async () => {
    mockLogin.mockImplementation(() => new Promise(() => {})); // never resolves

    renderScreen();
    await userEvent.type(screen.getByLabelText(/email/i), 'jennifer.anderson@toktickit.test');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });

  it('shows a generic failure banner on invalid credentials', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid email or password.'));

    renderScreen();
    await userEvent.type(screen.getByLabelText(/email/i), 'jennifer.anderson@toktickit.test');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
