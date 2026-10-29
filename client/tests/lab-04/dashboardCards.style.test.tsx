import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import { MetricCard } from '../../src/components/DashboardParts';
import ActionPanel from '../../src/components/ActionPanel';
import type { ActionTaken } from '../../src/components/ActionsTaken';

vi.mock('../../src/api/apiClient', async () => {
  const actual = await vi.importActual('../../src/api/apiClient');
  return { ...actual, apiFetch: vi.fn() };
});

const me = { id: 188, name: 'Alex Kim' };

describe('Dashboard cards and Action panel fields (STYLE-02)', () => {
  it('STYLE-02: a metric card is zg-card zg-metric with an h2 label, a live value and a named link', () => {
    render(<MemoryRouter><MetricCard label="Open" value={3} to="/tickets?status=OPEN" linkLabel="open tickets" /></MemoryRouter>);
    const card = screen.getByRole('heading', { level: 2, name: 'Open' }).closest('div.zg-card') as HTMLElement;
    expect(card).toHaveClass('zg-card', 'zg-metric');
    expect(within(card).getByText('3')).toHaveAttribute('aria-live', 'polite');
    expect(within(card).getByRole('link', { name: 'View all open tickets' })).toBeInTheDocument();
    const css = fs.readFileSync(path.resolve(__dirname, '../../src/styles/zen-green.css'), 'utf-8');
    expect(css).toMatch(/\.zg-metric\s*\{/);
  });

  it('STYLE-02: locked action fields use zg-readonly-field; errors use zg-field-error under their field', async () => {
    const locked: ActionTaken = {
      id: 1, ticketNumber: 'TKT-2026-000001', actionAt: '2026-10-28T03:00:00.000Z', description: 'Reset the profile.',
      result: 'Fixed', status: 'COMPLETED', performedBy: me, createdBy: me, followUpRequired: false, followUpNote: null,
      attachmentNotes: null, completedAt: '2026-10-28T04:00:00.000Z', cancelledAt: null,
      createdAt: '2026-10-28T03:01:00.000Z', updatedAt: '2026-10-28T04:00:00.000Z',
    };
    const props = { ticketNumber: 'TKT-2026-000001', staffUsers: [me], currentUser: me, onClose: vi.fn(), onSaved: vi.fn() };
    const { unmount } = render(<ActionPanel {...props} action={locked} />);
    expect(screen.getByText('Reset the profile.')).toHaveClass('zg-readonly-field');
    unmount();

    render(<ActionPanel {...props} action={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const description = screen.getByLabelText(/action description/i);
    const error = document.getElementById(description.getAttribute('aria-describedby')!)!;
    expect(error).toHaveClass('zg-field-error');
    expect(description.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
