import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RequesterSelection from '../../src/pages/RequesterSelection';
import { RequesterProvider } from '../../src/context/RequesterContext';

function renderScreen() {
  return render(
    <MemoryRouter>
      <RequesterProvider>
        <RequesterSelection />
      </RequesterProvider>
    </MemoryRouter>
  );
}

const activeRequesters = [
  { id: 1, name: 'Jennifer Anderson', email: 'jennifer.anderson@toktickit.test' },
  { id: 2, name: 'Michael Brown', email: 'michael.brown@toktickit.test' },
];

describe('RequesterSelection', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('UI-01: renders active requesters returned by the API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => activeRequesters,
    }) as any;

    renderScreen();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Jennifer Anderson' })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'Michael Brown' })).toBeInTheDocument();
  });

  it('UI-02: shows a loading state before the API responds', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as any; // never resolves

    renderScreen();

    expect(screen.getByText(/loading development requesters/i)).toBeInTheDocument();
  });

  it('UI-03: shows an empty state when no active requesters exist', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    }) as any;

    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByText(/no active development requesters are available/i)
      ).toBeInTheDocument();
    });
  });

  it('shows a safe error state and a Retry action on API failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as any;

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText(/unable to load development requesters/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('Continue is disabled until a requester is chosen', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => activeRequesters,
    }) as any;

    renderScreen();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Jennifer Anderson' })).toBeInTheDocument();
    });

    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(continueButton).toBeDisabled();

    await userEvent.selectOptions(
      screen.getByLabelText(/development requester/i),
      'Jennifer Anderson'
    );

    expect(continueButton).toBeEnabled();
  });
});
