import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/apiClient';
import { useRequester } from '../context/RequesterContext';

interface Attachment {
  id: number;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  isRemoved: boolean;
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
  currentStatus: 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
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
  const { requester } = useRequester();

  const [ticket, setTicket] = useState<TicketDetailResponse | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('loading');

  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadError, setUploadError] = useState('');

  const loadTicket = async () => {
    setFetchState('loading');
    try {
      const data = await apiFetch<TicketDetailResponse>(`/tickets/${ticketNumber}`, {
        requesterId: requester?.id,
      });
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
          requesterId: requester?.id,
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
          <div><StatusBadge value={ticket.currentStatus} /></div>
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

      {/* Attachments */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h6 mb-0">Attachments ({ticket.attachments.length})</h2>
      </div>

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
                <button type="button" className="btn btn-sm btn-zg-secondary" disabled title="Coming in Issue #9">
                  Download
                </button>
                {!a.isRemoved && (
                  <button type="button" className="btn btn-sm btn-zg-tertiary" disabled title="Coming in Issue #9">
                    Remove
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