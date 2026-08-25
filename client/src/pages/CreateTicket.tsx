import { useEffect, useState, FormEvent } from 'react';
import { apiFetch, ApiError } from '../api/apiClient';
import { useRequester } from '../context/RequesterContext';

interface RefItem {
  id: number;
  name: string;
}

interface TicketResponse {
  id: number;
  ticketNumber: string;
  createdAt: string;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB, BR-20
const MAX_ATTACHMENTS = 5; // BR-20

interface PendingFile {
  file: File;
  error?: string;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export default function CreateTicket() {
  const { requester } = useRequester();

  const [categories, setCategories] = useState<RefItem[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RefItem[]>([]);
  const [refError, setRefError] = useState(false);

  const [categoryId, setCategoryId] = useState('');
  const [relatedSystemId, setRelatedSystemId] = useState('');
  const [requestedPriority, setRequestedPriority] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitErrorMessage, setSubmitErrorMessage] = useState('');
  const [createdTicket, setCreatedTicket] = useState<TicketResponse | null>(null);

  useEffect(() => {
    loadReferenceData();
  }, []);

  const loadReferenceData = async () => {
    setRefError(false);
    try {
      const [cats, systems] = await Promise.all([
        apiFetch<RefItem[]>('/categories'),
        apiFetch<RefItem[]>('/related-systems'),
      ]);
      setCategories(cats);
      setRelatedSystems(systems);
    } catch {
      setRefError(true);
    }
  };

  const validateClientSide = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    const trimmedSummary = summary.trim();
    const trimmedDescription = description.trim();

    if (!trimmedSummary || trimmedSummary.length < 5 || trimmedSummary.length > 150) {
      errors.summary = 'Summary must be between 5 and 150 characters.';
    }
    if (!trimmedDescription || trimmedDescription.length < 10 || trimmedDescription.length > 2000) {
      errors.description = 'Description must be between 10 and 2000 characters.';
    }
    if (!categoryId) {
      errors.categoryId = 'Select a category.';
    }
    if (!relatedSystemId) {
      errors.relatedSystemId = 'Select a related system.';
    }
    if (!requestedPriority) {
      errors.requestedPriority = 'Select a priority.';
    }
    return errors;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file later

    const activeCount = pendingFiles.filter((f) => !f.error).length;
    const room = MAX_ATTACHMENTS - activeCount;

    const next: PendingFile[] = files.map((file) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return { file, error: `${file.name} — file type not allowed.` };
      }
      if (file.size > MAX_FILE_BYTES) {
        return { file, error: `${file.name} — exceeds 5MB limit.` };
      }
      return { file };
    });

    // Enforce the 5-active-attachment cap across valid files in this batch (AC-06)
    let validSeen = 0;
    const capped = next.map((pf) => {
      if (pf.error) return pf;
      validSeen += 1;
      if (validSeen > room) {
        return { file: pf.file, error: `${pf.file.name} — attachment limit (5) reached.` };
      }
      return pf;
    });

    setPendingFiles((prev) => [...prev, ...capped]);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const errors = validateClientSide();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitState('submitting');
    setSubmitErrorMessage('');

    try {
      const ticket = await apiFetch<TicketResponse>('/tickets', {
        method: 'POST',
        requesterId: requester?.id,
        body: JSON.stringify({
          categoryId: Number(categoryId),
          relatedSystemId: Number(relatedSystemId),
          requestedPriority,
          summary: summary.trim(),
          description: description.trim(),
        }),
      });

      setCreatedTicket(ticket);
      setSubmitState('success');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.fields) {
        setFieldErrors(err.fields);
        setSubmitState('idle');
      } else {
        setSubmitErrorMessage(
          err instanceof ApiError ? err.message : 'Unable to submit ticket. Please try again.'
        );
        setSubmitState('error');
      }
    }
  };

  const resetForm = () => {
    setCategoryId('');
    setRelatedSystemId('');
    setRequestedPriority('');
    setSummary('');
    setDescription('');
    setPendingFiles([]);
    setFieldErrors({});
    setSubmitState('idle');
    setCreatedTicket(null);
  };

  if (submitState === 'success' && createdTicket) {
    return (
      <div className="zg-card p-4" style={{ maxWidth: '640px' }}>
        <div className="zg-callout-info text-center py-4">
          <h2 className="h4 mb-2">Ticket created</h2>
          <p className="fs-3 fw-bold mb-1">{createdTicket.ticketNumber}</p>
          <p className="text-muted small mb-4">
            Your ticket has been submitted successfully.
          </p>
          <div className="d-flex justify-content-center gap-2">
            <button type="button" className="btn btn-zg-secondary" onClick={resetForm}>
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  const busy = submitState === 'submitting';

  return (
    <div className="zg-card p-4" style={{ maxWidth: '720px' }}>
      <h1 className="h4 mb-4">Create Ticket</h1>

      {submitState === 'error' && (
        <div className="zg-callout-error mb-4" role="alert">
          <p className="mb-0 fw-semibold">Unable to submit ticket. Please try again.</p>
          {submitErrorMessage && <p className="mb-0 small">{submitErrorMessage}</p>}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* System-generated row */}
        <div className="row mb-4">
          <div className="col-md-6 mb-3 mb-md-0">
            <label className="zg-label">Ticket Number</label>
            <div className="zg-readonly-field">Generated after submission</div>
          </div>
          <div className="col-md-6">
            <label className="zg-label">Ticket Date</label>
            <div className="zg-readonly-field">Generated at submission</div>
          </div>
        </div>

        <div className="mb-4">
          <label className="zg-label">Requester</label>
          <div className="zg-readonly-field">{requester?.name}</div>
        </div>

        {/* Classification row */}
        <div className="row mb-4">
          <div className="col-md-4 mb-3 mb-md-0">
            <label htmlFor="category" className="zg-label">
              Category<span className="zg-required-asterisk">*</span>
            </label>
            <select
              id="category"
              className={`form-select ${fieldErrors.categoryId ? 'is-invalid' : ''}`}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={busy}
            >
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {fieldErrors.categoryId && (
              <div className="zg-field-error">{fieldErrors.categoryId}</div>
            )}
          </div>

          <div className="col-md-4 mb-3 mb-md-0">
            <label htmlFor="relatedSystem" className="zg-label">
              Related System<span className="zg-required-asterisk">*</span>
            </label>
            <select
              id="relatedSystem"
              className={`form-select ${fieldErrors.relatedSystemId ? 'is-invalid' : ''}`}
              value={relatedSystemId}
              onChange={(e) => setRelatedSystemId(e.target.value)}
              disabled={busy}
            >
              <option value="">Select…</option>
              {relatedSystems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {fieldErrors.relatedSystemId && (
              <div className="zg-field-error">{fieldErrors.relatedSystemId}</div>
            )}
          </div>

          <div className="col-md-4">
            <label htmlFor="priority" className="zg-label">
              Requested Priority<span className="zg-required-asterisk">*</span>
            </label>
            <select
              id="priority"
              className={`form-select ${fieldErrors.requestedPriority ? 'is-invalid' : ''}`}
              value={requestedPriority}
              onChange={(e) => setRequestedPriority(e.target.value)}
              disabled={busy}
            >
              <option value="">Select…</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
            {fieldErrors.requestedPriority && (
              <div className="zg-field-error">{fieldErrors.requestedPriority}</div>
            )}
          </div>
        </div>

        {refError && (
          <div className="zg-callout-error mb-4" role="alert">
            Unable to load categories/related systems.{' '}
            <button
              type="button"
              className="btn btn-sm btn-zg-secondary ms-2"
              onClick={loadReferenceData}
            >
              Retry
            </button>
          </div>
        )}

        {/* Summary */}
        <div className="mb-4">
          <div className="d-flex justify-content-between">
            <label htmlFor="summary" className="zg-label">
              Ticket Summary<span className="zg-required-asterisk">*</span>
            </label>
            <span className="text-muted small">{summary.length}/150</span>
          </div>
          <input
            id="summary"
            type="text"
            maxLength={150}
            className={`form-control ${fieldErrors.summary ? 'is-invalid' : ''}`}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={busy}
          />
          {fieldErrors.summary && <div className="zg-field-error">{fieldErrors.summary}</div>}
        </div>

        {/* Description */}
        <div className="mb-4">
          <div className="d-flex justify-content-between">
            <label htmlFor="description" className="zg-label">
              Description<span className="zg-required-asterisk">*</span>
            </label>
            <span className="text-muted small">{description.length}/2000</span>
          </div>
          <textarea
            id="description"
            maxLength={2000}
            rows={5}
            className={`form-control ${fieldErrors.description ? 'is-invalid' : ''}`}
            style={{ resize: 'vertical', minHeight: '120px' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
          />
          {fieldErrors.description && (
            <div className="zg-field-error">{fieldErrors.description}</div>
          )}
        </div>

        {/* Attachments */}
        <div className="mb-4">
          <label className="zg-label">Attachments (optional)</label>
          <input
            type="file"
            className="form-control"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            onChange={handleFileSelect}
            disabled={busy || pendingFiles.filter((f) => !f.error).length >= MAX_ATTACHMENTS}
          />
          <div className="form-text">
            JPG, PNG, WEBP, or PDF · up to 5MB each · up to 5 files total.
          </div>

          {pendingFiles.length > 0 && (
            <ul className="list-group mt-2">
              {pendingFiles.map((pf, i) => (
                <li
                  key={i}
                  className="list-group-item d-flex justify-content-between align-items-center"
                >
                  <span>
                    {pf.error ? (
                      <span className="zg-field-error mb-0 d-inline">{pf.error}</span>
                    ) : (
                      <>
                        {pf.file.name}{' '}
                        <span className="text-muted small">
                          ({Math.round(pf.file.size / 1024)} KB)
                        </span>
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-zg-tertiary"
                    aria-label={`Remove ${pf.file.name}`}
                    onClick={() => removePendingFile(i)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actions */}
        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-zg-secondary" disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-zg-primary" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                Submitting…
              </>
            ) : (
              'Submit Ticket'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
