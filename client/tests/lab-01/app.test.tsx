import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/App';

describe('TokTickIT App', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('UI-01: renders the TokTickIT heading', () => {
    render(<App />);
    expect(screen.getByText('TokTickIT IT Service Desk')).toBeInTheDocument();
  });

  it('UI-02: shows loading state then displays categories on success', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok', service: 'TokTickIT API' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 1, name: 'Account and Access' },
          { id: 2, name: 'Hardware' },
          { id: 3, name: 'Software' },
          { id: 4, name: 'Network' },
        ],
      });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /check system/i }));

    expect(screen.getByText(/checking system/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Hardware')).toBeInTheDocument();
    });
    expect(screen.getByText('Account and Access')).toBeInTheDocument();
  });

  it('UI-03: shows an error message when the API call fails', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /check system/i }));

    await waitFor(() => {
      expect(screen.getByText('System Status: Offline')).toBeInTheDocument();
    });
    expect(screen.getByText('Unable to connect to TokTickIT API')).toBeInTheDocument();
  });
});
