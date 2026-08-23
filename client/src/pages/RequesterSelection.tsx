import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/apiClient';
import { useRequester } from '../context/RequesterContext';
import type { Requester } from '../context/RequesterContext';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';

export default function RequesterSelection() {
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [selectedId, setSelectedId] = useState<string>('');
  const { selectRequester } = useRequester();
  const navigate = useNavigate();

  const loadRequesters = async () => {
    setLoadState('loading');
    try {
      const data = await apiFetch<Requester[]>('/requesters');
      setRequesters(data);
      setLoadState(data.length === 0 ? 'empty' : 'loaded');
    } catch (err) {
      setLoadState('error');
    }
  };

  useEffect(() => {
    loadRequesters();
  }, []);

  const handleContinue = () => {
    const chosen = requesters.find((r) => String(r.id) === selectedId);
    if (!chosen) return;
    selectRequester(chosen);
    navigate('/tickets');
  };

  return (
    <div
      className="d-flex justify-content-center align-items-start"
      style={{ minHeight: '80vh', paddingTop: '4rem' }}
    >
      <div className="zg-card p-4" style={{ maxWidth: '480px', width: '100%' }}>
        <div className="text-center mb-3">
          <div
            className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3"
            style={{ width: '56px', height: '56px', backgroundColor: 'var(--zg-pale)' }}
          >
            <span style={{ fontSize: '1.5rem' }} aria-hidden="true">
              👤
            </span>
          </div>
          <h1 className="h4 fw-semibold mb-2">Select Development Requester</h1>
          <p className="text-muted small mb-0">
            Choose a development requester to simulate the current requester context for
            Lab 2. This is for testing only and is not a login screen.
          </p>
        </div>

        <hr className="my-3" />

        <label htmlFor="requester-select" className="zg-label">
          Development Requester
          <span className="zg-required-asterisk">*</span>
        </label>

        {loadState === 'loading' && (
          <div
            className="d-flex align-items-center gap-2 text-muted small py-2"
            role="status"
            aria-live="polite"
          >
            <div className="spinner-border spinner-border-sm" aria-hidden="true" />
            Loading development requesters…
          </div>
        )}

        {loadState === 'loaded' && (
          <select
            id="requester-select"
            className="form-select mb-3"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="Development Requester"
          >
            <option value="" disabled>
              Choose a requester…
            </option>
            {requesters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}

        {loadState === 'loaded' && (
          <div className="zg-callout-info small mb-3" role="status">
            Only active development requesters are shown.
          </div>
        )}

        {loadState === 'empty' && (
          <div className="zg-callout-error small mb-3" role="alert">
            No active development requesters are available. Contact an administrator.
          </div>
        )}

        {loadState === 'error' && (
          <div className="zg-callout-error small mb-3" role="alert">
            <p className="mb-2 fw-semibold">Unable to load development requesters.</p>
            <p className="mb-2">Check your connection and try again.</p>
            <button
              type="button"
              className="btn btn-sm btn-zg-secondary"
              onClick={loadRequesters}
            >
              Retry
            </button>
          </div>
        )}

        <div className="zg-callout-neutral small d-flex gap-2 mb-4">
          <span aria-hidden="true">🛡️</span>
          <span>
            <strong>Authentication coming in Lab 3</strong>
            <br />
            In Lab 3, this selection will be replaced with secure authentication so you
            can access the system with your own account.
          </span>
        </div>

        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-zg-secondary">
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-zg-primary"
            disabled={!selectedId || loadState !== 'loaded'}
            onClick={handleContinue}
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}
