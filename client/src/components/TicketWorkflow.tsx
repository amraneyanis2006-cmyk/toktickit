import { useState } from 'react';
import { apiFetch, ApiError } from '../api/apiClient';
import { legalNextStatuses } from '../utils/statusTransition';
import type { TicketStatus } from '../utils/statusTransition';
import ConfirmDialog from './ConfirmDialog';
import { isLocked, formatDateTime } from '../utils/actions';
import type { ActionTaken } from './ActionsTaken';

// Status control of the Operational Panel (ui-spec sec 7). The backend stays
// the authority: legal targets and the gate come from the ticket detail.

interface WorkflowTicket {
  ticketNumber: string;
  currentStatus: TicketStatus;
  updatedAt: string;
  resolvedAt?: string | null;
  legalNextStatuses?: TicketStatus[];
  resolutionGate?: { canResolve: boolean; blockers: string[] };
  actionsTaken?: ActionTaken[];
}

const label = (s: string) => s.replace(/_/g, ' ');
const title = (s: string) => label(s).toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function StatusBadge({ value }: { value: string }) {
  return <span className={`zg-badge zg-badge-status-${value.toLowerCase()}`}>{label(value)}</span>;
}

export default function TicketWorkflow({ ticket, onChanged }: { ticket: WorkflowTicket; onChanged: () => Promise<void> | void }) {
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Older responses (Lab 3 mocks) carry no legalNextStatuses/gate: fall back to the shared matrix.
  const targets = ticket.legalNextStatuses ?? legalNextStatuses(ticket.currentStatus);
  const gate = ticket.resolutionGate;
  const resolveBlocked = !!gate && !gate.canResolve && targets.includes('RESOLVED');
  const reason = gate?.blockers.includes('UNASSIGNED')
    ? 'Assign a Ticket Owner first.'
    : 'To resolve, complete at least one action and close all open actions.';
  const openActions = (ticket.actionsTaken ?? []).filter((a) => !isLocked(a)).length;

  const submit = async (target: TicketStatus) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      // ponytail: CANCELLED keeps the Lab 3 body (its Lab 3 test asserts it exactly); the server's
      // locked-row status re-check still rejects a concurrent change. Add the token once that test may change.
      const body = target === 'CANCELLED' ? { currentStatus: target } : { currentStatus: target, expectedUpdatedAt: ticket.updatedAt };
      await apiFetch(`/staff/tickets/${ticket.ticketNumber}/status`, { method: 'PATCH', body: JSON.stringify(body) });
      setChoice('');
      setSuccess(`Status changed to ${title(target)}.`);
      await onChanged();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      setError(err instanceof ApiError ? err.message : 'Unable to update status.');
      setChoice(''); // so the same target can be picked again to retry
      if (['RESOLUTION_BLOCKED', 'INVALID_TRANSITION', 'STALE_UPDATE', 'UNASSIGNED_TICKET'].includes(code)) await onChanged();
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };

  const select = (value: string) => {
    setChoice(value);
    if (value === 'CANCELLED') setConfirmCancel(true);
    else if (value) submit(value as TicketStatus);
  };

  return (
    <>
      <label htmlFor="currentStatus" className="zg-label">Current Status</label>
      <div className="mb-1"><StatusBadge value={ticket.currentStatus} /></div>
      {ticket.resolvedAt && <div className="small text-muted mb-1">Resolved on {formatDateTime(ticket.resolvedAt)}</div>}
      <select id="currentStatus" className="form-select form-select-sm" value={choice} onChange={(e) => select(e.target.value)}
        disabled={busy || targets.length === 0} aria-describedby={resolveBlocked ? 'resolve-reason' : undefined}>
        <option value="">{targets.length === 0 ? 'No transitions available' : 'Change to...'}</option>
        {targets.map((s) => (
          <option key={s} value={s} disabled={s === 'RESOLVED' && resolveBlocked}>{label(s)}</option>
        ))}
      </select>
      {resolveBlocked && <div id="resolve-reason" className="small text-muted mt-1">{reason}</div>}
      {error && <div className="zg-callout-error p-2 mt-2 small" role="alert">{error}</div>}
      {success && <div className="zg-callout-info p-2 mt-2 small" role="status">{success}</div>}

      {confirmCancel && (
        <ConfirmDialog title="Cancel this ticket? This cannot be undone." confirmLabel="Yes, cancel ticket" busy={busy}
          onConfirm={() => submit('CANCELLED')} onCancel={() => { setConfirmCancel(false); setChoice(''); }}>
          {openActions > 0 && (
            <p className="mb-0 small">{openActions === 1 ? 'This also cancels 1 open action.' : `This also cancels ${openActions} open actions.`}</p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

export function StatusHistory({ history }: { history?: Array<{ id: number; fromStatus: string; toStatus: string; changedBy: { name: string }; changedAt: string }> }) {
  return (
    <section className="mb-4">
      <h2 className="h6 mb-3">Status History</h2>
      {!history || history.length === 0 ? (
        <p className="text-muted small">History recorded from Lab 4 onwards.</p>
      ) : (
        <ol className="list-unstyled border-start ps-3" aria-label="Status history">
          {history.map((h) => (
            <li key={h.id} className="mb-2 small">
              <span className="fw-semibold">{title(h.fromStatus)} → {title(h.toStatus)}</span> · by {h.changedBy.name} · {formatDateTime(h.changedAt)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
