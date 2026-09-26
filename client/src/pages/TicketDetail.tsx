import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/apiClient';

interface Attachment {
  id: number;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  isRemoved: boolean;
}

interface Comment {
  id: number;
  ticketId: number;
  authorId: number;
  authorName: string;
  authorRole: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
  content: string;
  createdAt: string;
}

interface TicketDetailResponse {
  id: number;
  ticketNumber: string;
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  summary: string;
  description: string;
  requestedPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  itPriority: string | null;
  currentStatus: 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_REQUESTER' | 'RESOLVED' | 'CLOSED' | 'REOPENED' | 'CANCELLED';
  requesterIndicatedResolved: boolean;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
  publicComments: Comment[];
}

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB, BR-20
const MAX_ATTACHMENTS = 5; // BR-20

type FetchState = 'loading' | 'success' | 'not-found' | 'error';
type UploadState = 'idle' | 'uploading';

function PriorityBadge({ value }: { value: string }) {
  return <span className={`zg-badge zg-badge-priority-${value.toLowerCase()}`}>{value}</span>;
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`zg-badge zg-badge-status-${value.toLowerCase()}`}>{value.replace('_', ' ')}</span>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TicketDetail() {
  const { ticketNumber } = useParams<{ ticketNumber: string }>();

  const [ticket, setTicket] = useState<TicketDetailResponse | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('loading');

  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadError, setUploadError] = useState('');

  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState('');

  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState('');

  const [markingResolved, setMarkingResolved] = useState(false);
  const loadTicket = async () => {
    setFetchState('loading');
    try {
      const data = await apiFetch<TicketDetailResponse>(`/tickets/${ticketNumber}`);
      setTicket(data);
      setFetchState('success');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setFetchState('not-found');
      } else {
        setFetchState('error');
      }
    }
  };

  useEffect(() => {
    loadTicket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketNumber]);

  const activeAttachmentCount = ticket?.attachments.filter((a) => !a.isRemoved).length ?? 0;

  const handlePostComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;

    setCommentError('');
    setPostingComment(true);
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

  const handleMarkResolved = async () => {
    setMarkingResolved(true);
    try {
      await apiFetch(`/tickets/${ticketNumber}/resolved-indication`, { method: 'PATCH' });
      await loadTicket();
    } catch {
      // Safe failure: state simply doesn't update; the button remains actionable.
    } finally {
      setMarkingResolved(false);
    }
  };

  const formatCommentDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    setUploadError('');
    setUploadState('uploading');

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setUploadError(`${file.name} — file type not allowed.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setUploadError(`${file.name} — exceeds 5MB limit.`);
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('file', file);
        await apiFetch(`/tickets/${ticketNumber}/attachments`, {
          method: 'POST',
          body: formData,
        });
      } catch (err) {
        setUploadError(
          err instanceof ApiError ? err.message : `Unable to upload ${file.name}.`
        );
      }
    }

    setUploadState('idle');
    await loadTicket(); // refresh the attachment list in place
  };

  const handleDownload = async (attachmentId: number, filename: string) => {
    try {
      const res = await fetch(`http://localhost:3000/api/attachments/${attachmentId}/download`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setRemoveError('Unable to download this file.');
    }
  };

  const handleRemove = async (attachmentId: number) => {
    const reason = window.prompt('Why are you removing this attachment? (min. 3 characters)');
    if (reason === null) return; // user cancelled

    if (reason.trim().length < 3) {
      setRemoveError('A removal reason of at least 3 characters is required.');
      return;
    }

    setRemoveError('');
    setRemovingId(attachmentId);
    try {
      await apiFetch(`/attachments/${attachmentId}/remove`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await loadTicket();
    } catch (err) {
      setRemoveError(err instanceof ApiError ? err.message : 'Unable to remove this attachment.');
    } finally {
      setRemovingId(null);
    }
  };

  if (fetchState === 'loading') {
    return <div className="zg-card p-4 text-center text-muted py-5">Loading ticket…</div>;
  }

  if (fetchState === 'not-found') {
    return (
      <div className="zg-card p-4 text-center py-5">
        <p className="text-muted mb-3">This ticket doesn't exist or isn't yours.</p>
        <Link to="/tickets" className="btn btn-zg-secondary">
          ← Back to My Tickets
        </Link>
      </div>
    );
  }

  if (fetchState === 'error' || !ticket) {
    return (
      <div className="zg-callout-error text-center py-4" role="alert">
        <p className="mb-3 fw-semibold">Unable to load ticket.</p>
        <button type="button" className="btn btn-zg-secondary" onClick={loadTicket}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="zg-card p-4" style={{ maxWidth: '900px' }}>
      <nav className="mb-3 small">
        <Link to="/tickets" className="text-decoration-none">
          ← Back to My Tickets
        </Link>
      </nav>

      <h1 className="h4 mb-4">Ticket Details</h1>

      {/* Read-only info grid */}
      <div className="row mb-3">
        <div className="col-md-6 mb-3">
          <label className="zg-label">Ticket Number</label>
          <div className="zg-readonly-field">{ticket.ticketNumber}</div>
        </div>
        <div className="col-md-6 mb-3">
          <label className="zg-label">Ticket Date</label>
          <div className="zg-readonly-field">{formatDate(ticket.createdAt)}</div>
        </div>
        <div className="col-md-6 mb-3">
          <label className="zg-label">Category</label>
          <div className="zg-readonly-field">{ticket.category.name}</div>
        </div>
        <div className="col-md-6 mb-3">
          <label className="zg-label">Related System</label>
          <div className="zg-readonly-field">{ticket.relatedSystem.name}</div>
        </div>
        <div className="col-md-4 mb-3">
          <label className="zg-label">Requested Priority</label>
          <div><PriorityBadge value={ticket.requestedPriority} /></div>
        </div>
        <div className="col-md-4 mb-3">
          <label className="zg-label">IT Priority</label>
          <div className="zg-readonly-field">{ticket.itPriority ?? 'Not set'}</div>
        </div>
        <div className="col-md-4 mb-3">
          <label className="zg-label">Current Status</label>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <StatusBadge value={ticket.currentStatus} />
            {ticket.requesterIndicatedResolved ? (
              <button type="button" className="btn btn-sm btn-zg-secondary" disabled>
                You indicated this is resolved
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-zg-tertiary"
                onClick={handleMarkResolved}
                disabled={markingResolved}
              >
                {markingResolved ? 'Saving...' : 'Problem Appears Resolved'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className="zg-label">Summary</label>
        <div className="zg-readonly-field">{ticket.summary}</div>
      </div>

      <div className="mb-4">
        <label className="zg-label">Description</label>
        <div className="zg-readonly-field" style={{ whiteSpace: 'pre-wrap' }}>
          {ticket.description}
        </div>
      </div>

      <hr className="my-4" />

      {/* Public Comments */}
      <div className="mb-2">
        <h2 className="h6 mb-3">Public Comments ({ticket.publicComments.length})</h2>
      </div>

      {ticket.publicComments.length === 0 ? (
        <p className="text-muted small mb-3">No comments yet.</p>
      ) : (
        <div className="d-flex flex-column gap-2 mb-3">
          {ticket.publicComments.map((c) => (
            <div key={c.id} className="zg-callout-info p-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="fw-semibold">
                  {c.authorName}{' '}
                  <span className="badge bg-secondary ms-1">{c.authorRole.replace('_', ' ')}</span>
                </span>
                <span className="text-muted small">{formatCommentDate(c.createdAt)}</span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{c.content}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="new-comment" className="visually-hidden">
          Add a comment
        </label>
        <div className="input-group">
          <input
            id="new-comment"
            type="text"
            className="form-control"
            placeholder="Type your comment here..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            disabled={postingComment}
          />
          <button
            type="button"
            className="btn btn-zg-primary"
            onClick={handlePostComment}
            disabled={postingComment || !commentText.trim()}
          >
            {postingComment ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
        {commentError && <div className="zg-field-error mt-1">{commentError}</div>}
      </div>

      <hr className="my-4" />

      {/* Attachments */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h6 mb-0">Attachments ({ticket.attachments.length})</h2>
      </div>
      {removeError && <div className="zg-field-error mb-3">{removeError}</div>}

      <div className="mb-3">
        <input
          type="file"
          className="form-control"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          onChange={handleFileSelect}
          disabled={uploadState === 'uploading' || activeAttachmentCount >= MAX_ATTACHMENTS}
        />
        <div className="form-text">
          JPG, PNG, WEBP, or PDF · up to 5MB each · up to {MAX_ATTACHMENTS} active files.
          {uploadState === 'uploading' && ' Uploading…'}
        </div>
        {uploadError && <div className="zg-field-error">{uploadError}</div>}
      </div>

      {ticket.attachments.length === 0 ? (
        <p className="text-muted small">No attachments yet.</p>
      ) : (
        <ul className="list-group">
          {ticket.attachments.map((a) => (
            <li
              key={a.id}
              className="list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2"
            >
              <div>
                <div className="fw-semibold">{a.originalFileName}</div>
                <div className="text-muted small">
                  {formatSize(a.sizeBytes)} · uploaded {formatDate(a.uploadedAt)}
                </div>
              </div>
              <div className="d-flex align-items-center gap-2">
                <span
                  className={`zg-badge ${
                    a.isRemoved ? 'zg-badge-status-resolved' : 'zg-badge-status-open'
                  }`}
                >
                  {a.isRemoved ? 'Removed' : 'Active'}
                </span>
                {!a.isRemoved && (
                  <button
                    type="button"
                    className="btn btn-sm btn-zg-secondary"
                    onClick={() => handleDownload(a.id, a.originalFileName)}
                  >
                    Download
                  </button>
                )}
                {!a.isRemoved && (
                  <button
                    type="button"
                    className="btn btn-sm btn-zg-tertiary"
                    disabled={removingId === a.id}
                    onClick={() => handleRemove(a.id)}
                  >
                    {removingId === a.id ? 'Removing…' : 'Remove'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}