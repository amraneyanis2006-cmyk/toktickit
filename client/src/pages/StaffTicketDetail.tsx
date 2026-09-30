import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import { legalNextStatuses } from '../utils/statusTransition';
import type { TicketStatus } from '../utils/statusTransition';

interface StaffUser {
  id: number;
  name: string;
}

interface Comment {
  id: number;
  authorId: number;
  authorName: string;
  authorRole: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
  content: string;
  createdAt: string;
}

interface Note {
  id: number;
  authorId: number;
  authorName: string;
  content: string;
  createdAt: string;
}

interface Attachment {
  id: number;
  originalFileName: string;
  sizeBytes: number;
  uploadedAt: string;
  isRemoved: boolean;
}

interface StaffTicketDetailResponse {
  id: number;
  ticketNumber: string;
  requester: { id: number; name: string; email: string };
  ticketOwner: { id: number; name: string } | null;
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  summary: string;
  description: string;
  requestedPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  itPriority: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  currentStatus: TicketStatus;
  requesterIndicatedResolved: boolean;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
  publicComments: Comment[];
  internalNotes: Note[];
}

type FetchState = 'loading' | 'success' | 'not-found' | 'forbidden' | 'error';

function PriorityBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted small">Not set</span>;
  return <span className={`zg-badge zg-badge-priority-${value.toLowerCase()}`}>{value}</span>;
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`zg-badge zg-badge-status-${value.toLowerCase()}`}>{value.replace(/_/g, ' ')}</span>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function StaffTicketDetail() {
  const { ticketNumber } = useParams<{ ticketNumber: string }>();
  const { user } = useAuth();

  const [ticket, setTicket] = useState<StaffTicketDetailResponse | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);

  const [ownerActionError, setOwnerActionError] = useState('');
  const [savingOwner, setSavingOwner] = useState(false);
  const [reassignTarget, setReassignTarget] = useState('');

  const [savingPriority, setSavingPriority] = useState(false);
  const [priorityError, setPriorityError] = useState('');

  const [statusChoice, setStatusChoice] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState('');

  const [noteText, setNoteText] = useState('');
  const [postingNote, setPostingNote] = useState(false);
  const [noteError, setNoteError] = useState('');

  const loadTicket = async () => {
    try {
      const data = await apiFetch<StaffTicketDetailResponse>(`/staff/tickets/${ticketNumber}`);
      setTicket(data);
      setFetchState('success');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setFetchState('not-found');
      else if (err instanceof ApiError && err.status === 403) setFetchState('forbidden');
      else setFetchState('error');
    }
  };

  useEffect(() => {
    loadTicket();
    apiFetch<StaffUser[]>('/staff/users').then(setStaffUsers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketNumber]);

  const handleClaim = async () => {
    if (!ticket || !user) return;
    setSavingOwner(true);
    setOwnerActionError('');
    try {
      await apiFetch(`/staff/tickets/${ticketNumber}/claim`, {
        method: 'PATCH',
        body: JSON.stringify({ ticketOwnerId: user.id, expectedUpdatedAt: ticket.updatedAt }),
      });
      await loadTicket();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OWNERSHIP_CHANGED') {
        setOwnerActionError('This ticket was changed by someone else. Refreshing...');
        await loadTicket();
      } else {
        setOwnerActionError(err instanceof ApiError ? err.message : 'Unable to claim this ticket.');
      }
    } finally {
      setSavingOwner(false);
    }
  };

  const handleReassign = async () => {
    if (!ticket || !reassignTarget) return;
    setSavingOwner(true);
    setOwnerActionError('');
    try {
      await apiFetch(`/staff/tickets/${ticketNumber}/claim`, {
        method: 'PATCH',
        body: JSON.stringify({ ticketOwnerId: Number(reassignTarget), expectedUpdatedAt: ticket.updatedAt }),
      });
      await loadTicket();
      setReassignTarget('');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OWNERSHIP_CHANGED') {
        setOwnerActionError('This ticket was changed by someone else. Refreshing...');
        await loadTicket();
      } else {
        setOwnerActionError(err instanceof ApiError ? err.message : 'Unable to update ticket owner.');
      }
    } finally {
      setSavingOwner(false);
    }
  };

  const handlePriorityChange = async (value: string) => {
    if (!ticket) return;
    setSavingPriority(true);
    setPriorityError('');
    try {
      await apiFetch(`/staff/tickets/${ticketNumber}/priority`, {
        method: 'PATCH',
        body: JSON.stringify({ itPriority: value }),
      });
      await loadTicket();
    } catch (err) {
      setPriorityError(err instanceof ApiError ? err.message : 'Unable to update priority.');
    } finally {
      setSavingPriority(false);
    }
  };

  const submitStatusChange = async (target: string) => {
    setSavingStatus(true);
    setStatusError('');
    try {
      await apiFetch(`/staff/tickets/${ticketNumber}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ currentStatus: target }),
      });
      await loadTicket();
      setStatusChoice('');
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : 'Unable to update status.');
    } finally {
      setSavingStatus(false);
      setConfirmCancel(false);
    }
  };

  const handleStatusSelect = (value: string) => {
    setStatusChoice(value);
    if (value === 'CANCELLED') {
      setConfirmCancel(true);
      return;
    }
    if (value) submitStatusChange(value);
  };

  const handlePostComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    setPostingComment(true);
    setCommentError('');
    try {
      await apiFetch(`/tickets/${ticketNumber}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: trimmed }),
      });
      setCommentText('');
      await loadTicket();
    } catch (err) {
      setCommentError(err instanceof ApiError ? err.message : 'Unable to post comment.');
    } finally {
      setPostingComment(false);
    }
  };

  const handlePostNote = async () => {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    setPostingNote(true);
    setNoteError('');
    try {
      await apiFetch(`/staff/tickets/${ticketNumber}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content: trimmed }),
      });
      setNoteText('');
      await loadTicket();
    } catch (err) {
      setNoteError(err instanceof ApiError ? err.message : 'Unable to post note.');
    } finally {
      setPostingNote(false);
    }
  };

  if (fetchState === 'loading') {
    return <div className="zg-card p-4 text-center text-muted py-5">Loading ticket...</div>;
  }
  if (fetchState === 'not-found') {
    return (
      <div className="zg-card p-4 text-center py-5">
        <p className="text-muted mb-3">This ticket doesn't exist.</p>
        <Link to="/staff/tickets" className="btn btn-zg-secondary">&larr; Back to Queue</Link>
      </div>
    );
  }
  if (fetchState === 'forbidden' || fetchState === 'error' || !ticket) {
    return (
      <div className="zg-callout-error text-center py-4" role="alert">
        <p className="mb-3 fw-semibold">Unable to load ticket.</p>
        <button type="button" className="btn btn-zg-secondary" onClick={loadTicket}>Retry</button>
      </div>
    );
  }

  const legalStatuses = legalNextStatuses(ticket.currentStatus);

  return (
    <div className="zg-card p-4" style={{ maxWidth: '960px' }}>
      <nav className="mb-3 small">
        <Link to="/staff/tickets" className="text-decoration-none">&larr; Back to Queue</Link>
      </nav>

      <h1 className="h4 mb-4">Ticket Detail</h1>

      <div className="row mb-3">
        <div className="col-md-4 mb-3">
          <label className="zg-label">Ticket Number</label>
          <div className="zg-readonly-field">{ticket.ticketNumber}</div>
        </div>
        <div className="col-md-4 mb-3">
          <label className="zg-label">Category</label>
          <div className="zg-readonly-field">{ticket.category.name}</div>
        </div>
        <div className="col-md-4 mb-3">
          <label className="zg-label">Related System</label>
          <div className="zg-readonly-field">{ticket.relatedSystem.name}</div>
        </div>
        <div className="col-md-6 mb-3">
          <label className="zg-label">Requester</label>
          <div className="zg-readonly-field">{ticket.requester.name}</div>
        </div>
        <div className="col-md-6 mb-3">
          <label className="zg-label">Requested Priority</label>
          <div><PriorityBadge value={ticket.requestedPriority} /></div>
        </div>
      </div>

      <div className="mb-4">
        <label className="zg-label">Summary</label>
        <div className="zg-readonly-field">{ticket.summary}</div>
      </div>
      <div className="mb-4">
        <label className="zg-label">Description</label>
        <div className="zg-readonly-field" style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</div>
      </div>

      <hr className="my-4" />

      {/* Operational panel */}
      <h2 className="h6 mb-3">Operational Panel</h2>
      {ownerActionError && <div className="zg-field-error mb-2">{ownerActionError}</div>}

      <div className="row mb-4">
        <div className="col-md-6 mb-3">
          <label className="zg-label">Ticket Owner</label>
          <div className="mb-2">{ticket.ticketOwner ? ticket.ticketOwner.name : <span className="text-muted">Unassigned</span>}</div>
          {!ticket.ticketOwner ? (
            <button type="button" className="btn btn-sm btn-zg-primary" disabled={savingOwner} onClick={handleClaim}>
              {savingOwner ? 'Claiming...' : 'Claim'}
            </button>
          ) : (
            <div className="input-group input-group-sm">
              <select
                className="form-select"
                value={reassignTarget}
                onChange={(e) => setReassignTarget(e.target.value)}
                aria-label="Reassign to"
              >
                <option value="">Reassign to...</option>
                {staffUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <button type="button" className="btn btn-zg-secondary" disabled={savingOwner || !reassignTarget} onClick={handleReassign}>
                {savingOwner ? 'Saving...' : 'Reassign'}
              </button>
            </div>
          )}
        </div>

        <div className="col-md-3 mb-3">
          <label htmlFor="itPriority" className="zg-label">IT Priority</label>
          <select
            id="itPriority"
            className="form-select form-select-sm"
            value={ticket.itPriority ?? ''}
            onChange={(e) => handlePriorityChange(e.target.value)}
            disabled={savingPriority}
          >
            <option value="" disabled>Not set</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
          {priorityError && <div className="zg-field-error">{priorityError}</div>}
        </div>

        <div className="col-md-3 mb-3">
          <label htmlFor="currentStatus" className="zg-label">Current Status</label>
          <div className="mb-1"><StatusBadge value={ticket.currentStatus} /></div>
          <select
            id="currentStatus"
            className="form-select form-select-sm"
            value={statusChoice}
            onChange={(e) => handleStatusSelect(e.target.value)}
            disabled={savingStatus || legalStatuses.length === 0}
          >
            <option value="">{legalStatuses.length === 0 ? 'No transitions available' : 'Change to...'}</option>
            {legalStatuses.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          {statusError && <div className="zg-field-error">{statusError}</div>}
        </div>
      </div>

      {confirmCancel && (
        <div className="zg-callout-error mb-4" role="alertdialog">
          <p className="mb-2 fw-semibold">Cancel this ticket? This cannot be undone.</p>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-sm btn-zg-destructive" onClick={() => submitStatusChange('CANCELLED')} disabled={savingStatus}>
              Yes, cancel ticket
            </button>
            <button type="button" className="btn btn-sm btn-zg-secondary" onClick={() => { setConfirmCancel(false); setStatusChoice(''); }}>
              Never mind
            </button>
          </div>
        </div>
      )}

      <hr className="my-4" />

      {/* Public Comments */}
      <h2 className="h6 mb-3">Public Comments ({ticket.publicComments.length})</h2>
      <div className="d-flex flex-column gap-2 mb-3">
        {ticket.publicComments.map((c) => (
          <div key={c.id} className="zg-callout-info p-3">
            <div className="d-flex justify-content-between mb-1">
              <span className="fw-semibold">{c.authorName} <span className="badge bg-secondary ms-1">{c.authorRole.replace(/_/g, ' ')}</span></span>
              <span className="text-muted small">{formatDate(c.createdAt)}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{c.content}</div>
          </div>
        ))}
      </div>
      <div className="input-group mb-2">
        <input
          type="text"
          className="form-control"
          placeholder="Type your comment here..."
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          disabled={postingComment}
        />
        <button type="button" className="btn btn-zg-primary" onClick={handlePostComment} disabled={postingComment || !commentText.trim()}>
          {postingComment ? 'Posting...' : 'Post Comment'}
        </button>
      </div>
      {commentError ? <div className="zg-field-error mb-4">{commentError}</div> : <div className="mb-4" />}

      {/* Internal Notes - visually distinct from Public Comments */}
      <div
        className="p-3 mb-3"
        style={{ backgroundColor: '#FDF3D8', border: '1px dashed var(--zg-warning, #B8860B)', borderRadius: '6px' }}
      >
        <div className="fw-semibold mb-2" style={{ color: 'var(--zg-warning, #B8860B)' }}>
          Internal - Staff Only ({ticket.internalNotes.length})
        </div>
        <div className="d-flex flex-column gap-2 mb-3">
          {ticket.internalNotes.map((n) => (
            <div key={n.id} className="bg-white p-2 rounded">
              <div className="d-flex justify-content-between mb-1">
                <span className="fw-semibold">{n.authorName}</span>
                <span className="text-muted small">{formatDate(n.createdAt)}</span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{n.content}</div>
            </div>
          ))}
        </div>
        {noteError && <div className="zg-field-error mb-2">{noteError}</div>}
        <div className="input-group input-group-sm">
          <input
            type="text"
            className="form-control"
            placeholder="Add an internal note..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            disabled={postingNote}
          />
          <button type="button" className="btn btn-zg-secondary" onClick={handlePostNote} disabled={postingNote || !noteText.trim()}>
            {postingNote ? 'Saving...' : 'Add Note'}
          </button>
        </div>
      </div>

      <hr className="my-4" />

      {/* Attachments - read-only for staff */}
      <h2 className="h6 mb-3">Attachments ({ticket.attachments.length})</h2>
      {ticket.attachments.length === 0 ? (
        <p className="text-muted small">No attachments.</p>
      ) : (
        <ul className="list-group">
          {ticket.attachments.map((a) => (
            <li key={a.id} className="list-group-item d-flex justify-content-between">
              <span>{a.originalFileName}</span>
              <span className={`zg-badge ${a.isRemoved ? 'zg-badge-status-resolved' : 'zg-badge-status-open'}`}>
                {a.isRemoved ? 'Removed' : 'Active'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
