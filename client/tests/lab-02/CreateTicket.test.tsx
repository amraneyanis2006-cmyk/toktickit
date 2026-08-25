import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateTicket from '../../src/pages/CreateTicket';
import { RequesterProvider } from '../../src/context/RequesterContext';

const categories = [{ id: 1, name: 'Hardware' }];
const relatedSystems = [{ id: 1, name: 'Corporate Laptop' }];

function mockFetchSequence(...responses: any[]) {
  let call = 0;
  global.fetch = vi.fn(() => {
    const res = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return Promise.resolve(res);
  }) as any;
}

function jsonResponse(body: any, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderScreen() {
  sessionStorage.setItem(
    'toktickit.devRequester',
    JSON.stringify({ id: 1, name: 'Jennifer Anderson', email: 'jennifer@toktickit.test' })
  );
  return render(
    <RequesterProvider>
      <CreateTicket />
    </RequesterProvider>
  );
}

describe('CreateTicket', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('UI-04: submit without Summary shows a field-level error and does not call the API', async () => {
    mockFetchSequence(jsonResponse(categories), jsonResponse(relatedSystems));

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Hardware')).toBeInTheDocument();
    });

    const callsBeforeSubmit = (global.fetch as any).mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: /submit ticket/i }));

    expect(await screen.findByText(/summary must be between/i)).toBeInTheDocument();
    expect((global.fetch as any).mock.calls.length).toBe(callsBeforeSubmit);
  });

  it('UI-05/UI-06: busy state then success shows the returned ticket number', async () => {
    mockFetchSequence(
      jsonResponse(categories),
      jsonResponse(relatedSystems),
      jsonResponse({ id: 1, ticketNumber: 'TKT-2026-000001', createdAt: new Date().toISOString() }, 201)
    );

    renderScreen();

    await waitFor(() => expect(screen.getByText('Hardware')).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/category/i), 'Hardware');
    await userEvent.selectOptions(screen.getByLabelText(/related system/i), 'Corporate Laptop');
    await userEvent.selectOptions(screen.getByLabelText(/requested priority/i), 'Medium');
    await userEvent.type(screen.getByLabelText(/ticket summary/i), 'Laptop battery drains quickly');
    await userEvent.type(
      screen.getByLabelText(/description/i),
      'The battery drains much faster than usual even when idle.'
    );

    await userEvent.click(screen.getByRole('button', { name: /submit ticket/i }));

    expect(await screen.findByText('TKT-2026-000001')).toBeInTheDocument();
  });

  it('UI-07: API failure shows an error banner and preserves entered values', async () => {
    mockFetchSequence(
      jsonResponse(categories),
      jsonResponse(relatedSystems),
      { ok: false, status: 500, json: async () => ({ error: 'INTERNAL_ERROR', message: 'Server down' }) }
    );

    renderScreen();

    await waitFor(() => expect(screen.getByText('Hardware')).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/category/i), 'Hardware');
    await userEvent.selectOptions(screen.getByLabelText(/related system/i), 'Corporate Laptop');
    await userEvent.selectOptions(screen.getByLabelText(/requested priority/i), 'Medium');
    await userEvent.type(screen.getByLabelText(/ticket summary/i), 'Laptop battery drains quickly');
    await userEvent.type(
      screen.getByLabelText(/description/i),
      'The battery drains much faster than usual even when idle.'
    );

    await userEvent.click(screen.getByRole('button', { name: /submit ticket/i }));

    expect(await screen.findByText(/unable to submit ticket/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ticket summary/i)).toHaveValue('Laptop battery drains quickly');
  });

  it('UI-08: oversized attachment is rejected client-side with an inline error', async () => {
    mockFetchSequence(jsonResponse(categories), jsonResponse(relatedSystems));

    renderScreen();

    await waitFor(() => expect(screen.getByText('Hardware')).toBeInTheDocument());

    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'photo.png', {
      type: 'image/png',
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, bigFile);

    expect(await screen.findByText(/exceeds 5mb limit/i)).toBeInTheDocument();
  });
});
