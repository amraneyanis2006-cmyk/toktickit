import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserManagement from '../../src/pages/UserManagement';
import { apiFetch, ApiError } from '../../src/api/apiClient';

vi.mock('../../src/api/apiClient', async () => {
  const actual = await vi.importActual('../../src/api/apiClient');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'Admin One', email: 'admin1@example.com', role: 'ADMINISTRATOR', mustChangePassword: false },
    status: 'ready',
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const users = [
  { id: 1, name: 'Admin One', email: 'admin1@example.com', role: 'ADMINISTRATOR', isActive: true },
  { id: 2, name: 'Alex Kim', email: 'alex@example.com', role: 'IT_STAFF', isActive: true },
  { id: 3, name: 'Sarah Johnson', email: 'sarah@example.com', role: 'REQUESTER', isActive: false },
];

function setupApi(list: typeof users = users) {
  (apiFetch as any).mockImplementation((path: string, opts?: { method?: string }) => {
    if (opts?.method) return Promise.resolve({});
    if (path === '/admin/users?role=ADMINISTRATOR') {
      return Promise.resolve(list.filter((u) => u.role === 'ADMINISTRATOR'));
    }
    return Promise.resolve(list);
  });
}

function pathsCalled(): string[] {
  return (apiFetch as any).mock.calls.map((c: unknown[]) => String(c[0]));
}

async function openEdit(name: string) {
  const buttons = await screen.findAllByRole('button', { name: `Edit ${name}` });
  await userEvent.click(buttons[0]!);
  return screen.findByRole('dialog');
}

describe('UserManagement (UI-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists users with name, email, role, status and an Edit action', async () => {
    setupApi();
    render(<UserManagement />);

    expect((await screen.findAllByText('Alex Kim')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('alex@example.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText('IT Staff').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Edit Alex Kim' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('(you)').length).toBeGreaterThan(0);
  });

  it('sends the search term and the role filter to the API', async () => {
    setupApi();
    render(<UserManagement />);
    await screen.findAllByText('Alex Kim');

    await userEvent.type(screen.getByPlaceholderText(/search by name or email/i), 'alex');
    await waitFor(() => expect(pathsCalled()).toContain('/admin/users?search=alex'));

    await userEvent.selectOptions(screen.getByLabelText('Filter by role'), 'IT_STAFF');
    await waitFor(() => expect(pathsCalled().some((p) => p.includes('role=IT_STAFF'))).toBe(true));
  });

  it('distinguishes "no users" from "no matches for this search"', async () => {
    setupApi([]);
    render(<UserManagement />);
    expect(await screen.findByText(/no users yet/i)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/search by name or email/i), 'zzz');
    expect(await screen.findByText(/no users match your search/i)).toBeInTheDocument();
    expect(screen.queryByText(/no users yet/i)).not.toBeInTheDocument();
  });

  it('shows a retry banner when the list cannot be loaded', async () => {
    (apiFetch as any).mockRejectedValue(new Error('network down'));
    render(<UserManagement />);

    expect(await screen.findByText(/unable to load users/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('creates a user, tells the admin where the password went, and closes the panel', async () => {
    setupApi();
    render(<UserManagement />);
    await screen.findAllByText('Alex Kim');

    await userEvent.click(screen.getByRole('button', { name: /\+ create user/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/full name/i), 'New Hire');
    await userEvent.type(within(dialog).getByLabelText(/email address/i), 'new.hire@example.com');
    await userEvent.selectOptions(within(dialog).getByLabelText(/^role/i), 'IT_STAFF');
    await userEvent.click(within(dialog).getByRole('button', { name: /^create user$/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/admin/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'New Hire', email: 'new.hire@example.com', role: 'IT_STAFF', isActive: true }),
        })
      );
    });
    expect(await screen.findByText(/server console/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not call the API when required fields are empty', async () => {
    setupApi();
    render(<UserManagement />);
    await screen.findAllByText('Alex Kim');
    (apiFetch as any).mockClear();

    await userEvent.click(screen.getByRole('button', { name: /\+ create user/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^create user$/i }));

    expect(await within(dialog).findByText('Name is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('Email is required.')).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('shows a duplicate-email error under the Email field', async () => {
    setupApi();
    render(<UserManagement />);
    await screen.findAllByText('Alex Kim');

    (apiFetch as any).mockImplementation((path: string, opts?: { method?: string }) => {
      if (opts?.method === 'POST') {
        return Promise.reject(new ApiError(409, 'DUPLICATE_EMAIL', 'This email address is already in use.'));
      }
      return Promise.resolve(users);
    });

    await userEvent.click(screen.getByRole('button', { name: /\+ create user/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/full name/i), 'Copycat');
    await userEvent.type(within(dialog).getByLabelText(/email address/i), 'alex@example.com');
    await userEvent.click(within(dialog).getByRole('button', { name: /^create user$/i }));

    expect(await within(dialog).findByText('This email address is already in use.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/email address/i)).toHaveClass('is-invalid');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('locks Role and Active on the administrator\'s own account, and says why', async () => {
    setupApi();
    render(<UserManagement />);

    const dialog = await openEdit('Admin One');

    expect(within(dialog).getByLabelText(/^role/i)).toBeDisabled();
    expect(within(dialog).getByRole('switch', { name: /active/i })).toBeDisabled();
    expect(within(dialog).getByText(/cannot change your own role or deactivate your own account/i)).toBeInTheDocument();
  });

  it('leaves Role and Active editable on another user', async () => {
    setupApi();
    render(<UserManagement />);

    const dialog = await openEdit('Alex Kim');

    expect(within(dialog).getByLabelText(/^role/i)).toBeEnabled();
    expect(within(dialog).getByRole('switch', { name: /active/i })).toBeEnabled();
  });

  it('sends only the fields that changed', async () => {
    setupApi();
    render(<UserManagement />);

    const dialog = await openEdit('Alex Kim');
    const nameInput = within(dialog).getByLabelText(/full name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Alex K');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save user$/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/admin/users/2',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Alex K' }) })
      );
    });
  });

  it('asks for confirmation before issuing a new initial password', async () => {
    setupApi();
    render(<UserManagement />);

    const dialog = await openEdit('Alex Kim');
    await userEvent.click(within(dialog).getByRole('button', { name: /set new initial password/i }));

    expect(within(dialog).getByText(/issue a new initial password for alex kim/i)).toBeInTheDocument();
    expect(pathsCalled().some((p) => p.endsWith('/reset-password'))).toBe(false);

    await userEvent.click(within(dialog).getByRole('button', { name: /yes, issue new password/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/admin/users/2/reset-password',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  it('closes the panel on Escape', async () => {
    setupApi();
    render(<UserManagement />);

    await openEdit('Alex Kim');
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
