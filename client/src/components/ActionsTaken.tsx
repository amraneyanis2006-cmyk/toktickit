import { useState } from 'react';
import ActionPanel from './ActionPanel';
import { formatDateTime, isLocked } from '../utils/actions';

// Actions Taken section (ui-spec sec 6): table from 992 px (Bootstrap lg),
// cards below; the Requester variant is read-only.

export type ActionStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ActionTaken {
  id: number;
  ticketNumber: string;
  actionAt: string;
  description: string;
  result: string | null;
  status: ActionStatus;
  performedBy: { id: number; name: string };
  createdBy: { id: number; name: string };
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffUser {
  id: number;
  name: string;
}

const LABELS: Record<ActionStatus, string> = {
  PLANNED: 'Planned', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};

export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  return <span className={`zg-badge zg-badge-action-${status.toLowerCase()}`}>{LABELS[status]}</span>;
}

function Description({ action }: { action: ActionTaken }) {
  return (
    <span data-testid="action-description" style={action.status === 'CANCELLED' ? { textDecoration: 'line-through' } : undefined}>
      {action.description}
    </span>
  );
}

function LockText({ action }: { action: ActionTaken }) {
  if (!isLocked(action)) return null;
  return <span className="text-muted small ms-1"><span aria-hidden="true">🔒 </span>Locked</span>;
}

function FollowUp({ action }: { action: ActionTaken }) {
  return action.followUpRequired ? <span className="zg-badge zg-badge-followup" title={action.followUpNote ?? undefined}>Follow-up</span> : null;
}

export default function ActionsTaken({
  ticketNumber, actions, staffUsers = [], currentUser, readOnly = false, canAdd = true, onChanged,
}: {
  ticketNumber: string;
  /** false on an inactive ticket (BR-10): no new action can be recorded. */
  canAdd?: boolean;
  actions: ActionTaken[];
  staffUsers?: StaffUser[];
  currentUser?: { id: number; name: string };
  readOnly?: boolean;
  onChanged?: () => Promise<void> | void;
}) {
  // undefined: no panel; null: create panel; an action: view/edit panel.
  const [panel, setPanel] = useState<ActionTaken | null | undefined>(undefined);
  const sorted = [...actions].sort((a, b) => a.actionAt.localeCompare(b.actionAt) || a.id - b.id);
  const title = readOnly ? 'Work done on your ticket' : `Actions Taken (${actions.length})`;

  return (
    <section className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h6 mb-0">{title}</h2>
        {!readOnly && canAdd && panel === undefined && (
          <button type="button" className="btn btn-sm btn-zg-primary" onClick={() => setPanel(null)}>Add Action</button>
        )}
      </div>

      {panel !== undefined && !readOnly && currentUser && (
        <ActionPanel
          key={panel === null ? 'new' : panel.id}
          ticketNumber={ticketNumber}
          action={panel}
          staffUsers={staffUsers}
          currentUser={currentUser}
          onClose={() => setPanel(undefined)}
          onSaved={async () => { setPanel(undefined); await onChanged?.(); }}
        />
      )}

      {sorted.length === 0 ? (
        <div className="zg-callout-neutral p-3">
          {readOnly ? 'No work has been recorded on this ticket yet.' : 'No actions recorded yet. Record the work done on this ticket.'}
        </div>
      ) : (
        <>
          <div className="d-none d-lg-block table-responsive">
            <table className="table table-sm align-middle">
              <thead>
                <tr>
                  <th scope="col">Date/Time</th><th scope="col">Action</th><th scope="col">Result</th><th scope="col">Performed by</th>
                  <th scope="col">Status</th><th scope="col">Follow-up</th><th scope="col">Attachment notes</th>
                  {!readOnly && <th scope="col"><span className="visually-hidden">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => (
                  <tr key={a.id}>
                    <td className="small text-nowrap">{formatDateTime(a.actionAt)}</td>
                    <td><Description action={a} /></td>
                    <td className="small">{a.result ?? <span className="text-muted">—</span>}</td>
                    <td className="small">{a.performedBy.name}</td>
                    <td><ActionStatusBadge status={a.status} /><LockText action={a} /></td>
                    <td><FollowUp action={a} /></td>
                    <td className="small" style={{ wordBreak: 'break-word' }}>{a.attachmentNotes}</td>
                    {!readOnly && (
                      <td><button type="button" className="btn btn-sm btn-zg-secondary" disabled={panel !== undefined} onClick={() => setPanel(a)} aria-label={`View action: ${a.description}`}>View</button></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="d-lg-none d-flex flex-column gap-2">
            {sorted.map((a) => (
              <div key={a.id} className="zg-card p-3">
                <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                  <Description action={a} />
                  <span className="text-nowrap"><ActionStatusBadge status={a.status} /><LockText action={a} /></span>
                </div>
                <div className="small text-muted mb-1">{formatDateTime(a.actionAt)} · {a.performedBy.name}</div>
                {a.result && <div className="small"><span className="zg-label d-inline">Result: </span>{a.result}</div>}
                {a.attachmentNotes && <div className="small"><span className="zg-label d-inline">Attachment notes: </span>{a.attachmentNotes}</div>}
                <FollowUp action={a} />
                {!readOnly && (
                  <button type="button" className="btn btn-sm btn-zg-secondary w-100 mt-2" style={{ minHeight: 44 }} disabled={panel !== undefined} onClick={() => setPanel(a)} aria-label={`View action: ${a.description}`}>View</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
