import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActionsTaken from '../../src/components/ActionsTaken';
import type { ActionTaken } from '../../src/components/ActionsTaken';
import { apiFetch, ApiError } from '../../src/api/apiClient';

vi.mock('../../src/api/apiClient', async () => {
  const actual = await vi.importActual('../../src/api/apiClient');
  return { ...actual, apiFetch: vi.fn() };
});

const me = { id: 188, name: 'Alex Kim' };
const staffUsers = [me, { id: 191, name: 'Priya Nandi' }];

function action(overrides: Partial<ActionTaken> = {}): ActionTaken {
  return {
    id: 1, ticketNumber: 'TKT-2026-000001', actionAt: '2026-10-28T03:00:00.000Z',
    description: 'Reset the Wi-Fi profile.', result: null, status: 'PLANNED',
    performedBy: me, createdBy: me, followUpRequired: false, followUpNote: null, attachmentNotes: null,
    completedAt: null, cancelledAt: null, createdAt: '2026-10-28T03:01:00.000Z', updatedAt: '2026-10-28T03:01:00.000Z',
    ...overrides,
  };
}

function renderList(actions: ActionTaken[], extra: Partial<Parameters<typeof ActionsTaken>[0]> = {}) {
  const onChanged = vi.fn().mockResolvedValue(undefined);
  render(<ActionsTaken ticketNumber="TKT-2026-000001" actions={actions} staffUsers={staffUsers} currentUser={me} onChanged={onChanged} {...extra} />);
  return onChanged;
}

const desktopTable = () => screen.getByRole('table');

describe('ActionsTaken (UI-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiFetch as any).mockResolvedValue({});
  });

  it('UI-03: lists actions in chronological order (actionAt, then id), with status badges and Locked rows', () => {
    renderList([
      action({ id: 3, actionAt: '2026-10-28T05:00:00.000Z', description: 'third', status: 'COMPLETED', result: 'Done' }),
      action({ id: 1, actionAt: '2026-10-28T03:00:00.000Z', description: 'first' }),
      action({ id: 2, actionAt: '2026-10-28T03:00:00.000Z', description: 'second', status: 'CANCELLED' }),
    ]);
    const rows = within(desktopTable()).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getByTestId('action-description').textContent)).toEqual(['first', 'second', 'third']);
    expect(within(rows[1]!).getByText('Cancelled')).toHaveClass('zg-badge-action-cancelled');
    expect(within(rows[1]!).getByText('Locked')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Locked')).toBeInTheDocument();
    expect(within(rows[0]!).queryByText('Locked')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /actions taken \(3\)/i })).toBeInTheDocument();
  });

  it('UI-03: create requires a Follow-up Note when follow-up is checked, and posts the documented body', async () => {
    renderList([]);
    await userEvent.click(screen.getByRole('button', { name: /add action/i }));
    expect(screen.getByText(/recorded by alex kim/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/performed by/i)).toHaveValue('188');
    await userEvent.type(screen.getByLabelText(/action description/i), 'Re-enrolled the certificate.');
    await userEvent.click(screen.getByLabelText(/follow-up required/i));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const note = screen.getByLabelText(/follow-up note/i);
    expect(note).toHaveAttribute('aria-describedby', expect.stringContaining('followUpNote-error'));
    expect(screen.getByText(/follow-up note is required/i)).toHaveClass('zg-field-error');
    expect(apiFetch).not.toHaveBeenCalled();

    await userEvent.type(note, 'Check on Friday.');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const [path, opts] = (apiFetch as any).mock.calls[0];
    expect(path).toBe('/staff/tickets/TKT-2026-000001/actions');
    expect(JSON.parse(opts.body)).toMatchObject({
      description: 'Re-enrolled the certificate.', followUpRequired: true, followUpNote: 'Check on Friday.',
      performedById: 188, clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it('UI-03: Save is busy-disabled, values are kept after a failure, and a retry reuses the same clientRequestId', async () => {
    let reject!: (e: unknown) => void;
    (apiFetch as any).mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    renderList([]);
    await userEvent.click(screen.getByRole('button', { name: /add action/i }));
    await userEvent.type(screen.getByLabelText(/action description/i), 'Swapped the cable.');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();

    reject(new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the TokTickIT API.'));
    expect(await screen.findByText(/unable to reach the toktickit api/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/action description/i)).toHaveValue('Swapped the cable.');

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    const ids = (apiFetch as any).mock.calls.map((c: [string, { body: string }]) => JSON.parse(c[1].body).clientRequestId);
    expect(ids[0]).toBe(ids[1]);
  });

  it('UI-03: Complete asks for a Result before calling the API', async () => {
    renderList([action({ status: 'IN_PROGRESS' })]);
    await userEvent.click(within(desktopTable()).getByRole('button', { name: /view/i }));
    await userEvent.click(screen.getByRole('button', { name: /^complete$/i }));
    expect(screen.getByText(/a result is required to complete/i)).toHaveClass('zg-field-error');
    expect(screen.getByLabelText(/^result/i)).toHaveFocus();
    expect(apiFetch).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/^result/i), 'Works now.');
    await userEvent.click(screen.getByRole('button', { name: /^complete$/i }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      '/staff/tickets/TKT-2026-000001/actions/1/status',
      expect.objectContaining({ method: 'PATCH' })
    ));
    expect(JSON.parse((apiFetch as any).mock.calls[0][1].body)).toEqual({
      status: 'COMPLETED', result: 'Works now.', expectedUpdatedAt: '2026-10-28T03:01:00.000Z',
    });
  });

  it('UI-03: Cancel action opens an accessible confirmation dialog (Esc closes, focus returns to the opener)', async () => {
    renderList([action()]);
    await userEvent.click(within(desktopTable()).getByRole('button', { name: /view/i }));
    const opener = screen.getByRole('button', { name: /cancel action/i });
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText(/cancel this action\? it stays in the history and can't be edited/i)).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button')).toContain(document.activeElement);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(apiFetch).not.toHaveBeenCalled();

    await userEvent.click(opener);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /yes, cancel action/i }));
    await waitFor(() => expect(JSON.parse((apiFetch as any).mock.calls[0][1].body)).toMatchObject({ status: 'CANCELLED' }));
  });

  it('UI-03: while a panel is open the other rows cannot be opened (no unsaved draft is dropped); closing returns focus', async () => {
    renderList([action({ id: 1, description: 'first' }), action({ id: 2, description: 'second', actionAt: '2026-10-28T04:00:00.000Z' })]);
    const views = within(desktopTable()).getAllByRole('button', { name: /view/i });
    await userEvent.click(views[0]!);
    expect(screen.getByRole('heading', { name: /edit action/i })).toHaveFocus();
    for (const v of within(desktopTable()).getAllByRole('button', { name: /view/i })) expect(v).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(views[0]).toHaveFocus();
    await userEvent.click(views[1]!);
    expect(screen.getByLabelText(/action description/i)).toHaveValue('second');
  });

  it('UI-03: an edit refused with TICKET_NOT_ACTIVE keeps the typed text visible in the frozen panel', async () => {
    (apiFetch as any).mockRejectedValueOnce(new ApiError(409, 'TICKET_NOT_ACTIVE', 'x'));
    renderList([action()]);
    await userEvent.click(within(desktopTable()).getByRole('button', { name: /view/i }));
    await userEvent.type(screen.getByLabelText(/action description/i), ' plus my edit');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/no longer active/i)).toBeInTheDocument();
    expect(screen.getByText('Reset the Wi-Fi profile. plus my edit')).toBeInTheDocument();
  });

  it('UI-03: a locked action opens read-only with only Close', async () => {
    renderList([action({ status: 'COMPLETED', result: 'Done' })]);
    await userEvent.click(within(desktopTable()).getByRole('button', { name: /view/i }));
    expect(screen.queryByRole('button', { name: /save changes|start|complete|cancel action/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('UI-03: STALE_UPDATE shows the latest version and keeps my unsaved text; INVALID_ASSIGNEE shows under Performed by', async () => {
    const current = action({ description: 'Their newer text', updatedAt: '2026-10-28T04:00:00.000Z' });
    (apiFetch as any)
      .mockRejectedValueOnce(Object.assign(new ApiError(409, 'STALE_UPDATE', 'stale'), { details: { current } }))
      .mockRejectedValueOnce(new ApiError(422, 'INVALID_ASSIGNEE', 'bad'));
    renderList([action()]);
    await userEvent.click(within(desktopTable()).getByRole('button', { name: /view/i }));
    const description = screen.getByLabelText(/action description/i);
    await userEvent.clear(description);
    await userEvent.type(description, 'My own edit');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/someone else updated this action\. the latest version is shown\./i)).toHaveClass('zg-callout-info');
    expect(screen.getByLabelText(/action description/i)).toHaveValue('Their newer text');
    expect(screen.getByText('My own edit')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/performed by/i), '191');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/this person can't be assigned \(inactive or not it staff\)/i)).toHaveClass('zg-field-error');
    expect(JSON.parse((apiFetch as any).mock.calls[1][1].body).expectedUpdatedAt).toBe('2026-10-28T04:00:00.000Z');
  });

  it('UI-03: TICKET_NOT_ACTIVE shows the ui-spec message; IDEMPOTENCY_KEY_REUSED shows the saved action', async () => {
    const saved = action({ id: 9, description: 'The action saved earlier', status: 'CANCELLED' });
    (apiFetch as any)
      .mockRejectedValueOnce(new ApiError(409, 'TICKET_NOT_ACTIVE', 'x'))
      .mockRejectedValueOnce(Object.assign(new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'x'), { details: { current: saved } }));
    const onChanged = renderList([]);
    await userEvent.click(screen.getByRole('button', { name: /add action/i }));
    await userEvent.type(screen.getByLabelText(/action description/i), 'Anything');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByText(/this ticket is no longer active, so its actions can't be changed\./i)).toHaveClass('zg-callout-error');
    // The panel is frozen; closing it reloads the Ticket Detail.
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onChanged).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /add action/i }));
    await userEvent.type(screen.getByLabelText(/action description/i), 'Anything');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByText(/already saved/i)).toBeInTheDocument();
    expect(screen.getByText('The action saved earlier')).toBeInTheDocument();
  });

  it('UI-03: the Requester variant is read-only - no buttons, its own title, no Created by', () => {
    renderList([action({ createdBy: { id: 5, name: 'Somebody Else' } })], { readOnly: true });
    expect(screen.getByRole('heading', { name: /work done on your ticket/i })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Somebody Else')).not.toBeInTheDocument();
  });
});
