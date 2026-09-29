import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/apiClient';

interface TicketRow {
  id: number;
  ticketNumber: string;
  summary: string;
  categoryName: string;
  requestedPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  itPriority: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  currentStatus: string;
  ticketOwner: { id: number; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface QueueResponse {
  data: TicketRow[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

type SortField = 'ticketNumber' | 'createdAt' | 'updatedAt';
type FetchState = 'loading' | 'success' | 'error';

const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const PAGE_SIZES = [10, 20, 50];

function PriorityBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted small">Not set</span>;
  return <span className={`zg-badge zg-badge-priority-${value.toLowerCase()}`}>{value}</span>;
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`zg-badge zg-badge-status-${value.toLowerCase()}`}>{value.replace(/_/g, ' ')}</span>;
}

export default function StaffTicketQueue() {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [ownership, setOwnership] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [result, setResult] = useState<QueueResponse | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [hasEverHadTickets, setHasEverHadTickets] = useState<boolean | null>(null);
  const latestRequestId = useRef(0);

  const filtersActive = Boolean(search || status || priority || ownership !== 'all');

  const loadQueue = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    setFetchState('loading');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      if (ownership !== 'all') params.set('ownership', ownership);
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));

      const res = await apiFetch<QueueResponse>(`/staff/tickets?${params.toString()}`);
      if (requestId !== latestRequestId.current) return; // a newer request has already superseded this one
      setResult(res);
      setFetchState('success');

      if (!filtersActive) {
        setHasEverHadTickets(res.pagination.totalItems > 0);
      } else if (hasEverHadTickets === null) {
        setHasEverHadTickets(true);
      }
    } catch {
      if (requestId === latestRequestId.current) setFetchState('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, priority, ownership, sortBy, sortDir, page, pageSize]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setPriority('');
    setOwnership('all');
    setPage(1);
  };

  const sortCaret = (field: SortField) => (sortBy === field ? (sortDir === 'asc' ? ' \u25b2' : ' \u25bc') : '');

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  const openTicket = (ticketNumber: string) => navigate(`/staff/tickets/${ticketNumber}`);

  return (
    <div className="zg-card p-4">
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-4">
        <div>
          <h1 className="h4 mb-1">Ticket Queue</h1>
          <p className="text-muted small mb-0">Find and prioritize work across all Requesters.</p>
        </div>
        {filtersActive && (
          <button type="button" className="btn btn-zg-tertiary" onClick={clearFilters}>
            Clear Filters
          </button>
        )}
      </div>

      <div className="row g-2 mb-4">
        <div className="col-12 col-md-4">
          <input
            type="search"
            className="form-control"
            placeholder="Search by ticket number or summary..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="col-6 col-md-3">
          <select
            className="form-select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <select
            className="form-select"
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-3">
          <select
            className="form-select"
            value={ownership}
            onChange={(e) => {
              setOwnership(e.target.value as 'all' | 'mine' | 'unassigned');
              setPage(1);
            }}
          >
            <option value="all">All Tickets</option>
            <option value="mine">Mine</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>
      </div>

      {fetchState === 'error' && (
        <div className="zg-callout-error text-center py-4" role="alert">
          <p className="mb-3 fw-semibold">Unable to load tickets.</p>
          <button type="button" className="btn btn-zg-secondary" onClick={loadQueue}>
            Retry
          </button>
        </div>
      )}

      {fetchState === 'loading' && <div className="text-center text-muted py-5">Loading tickets...</div>}

      {fetchState === 'success' && result && result.data.length === 0 && !filtersActive && (
        <div className="text-center py-5">
          <p className="text-muted mb-0">No tickets yet.</p>
        </div>
      )}

      {fetchState === 'success' && result && result.data.length === 0 && filtersActive && (
        <div className="text-center py-5">
          <p className="text-muted mb-3">No tickets match your filters.</p>
          <button type="button" className="btn btn-zg-secondary" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      )}

      {fetchState === 'success' && result && result.data.length > 0 && (
        <>
          <div className="table-responsive d-none d-lg-block">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th role="button" onClick={() => handleSort('ticketNumber')}>
                    Ticket No.{sortCaret('ticketNumber')}
                  </th>
                  <th role="button" onClick={() => handleSort('createdAt')}>
                    Created Date{sortCaret('createdAt')}
                  </th>
                  <th>Summary</th>
                  <th>Category</th>
                  <th>Requested Priority</th>
                  <th>IT Priority</th>
                  <th>Current Status</th>
                  <th>Ticket Owner</th>
                  <th role="button" onClick={() => handleSort('updatedAt')}>
                    Last Updated{sortCaret('updatedAt')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((t) => (
                  <tr key={t.id} onClick={() => openTicket(t.ticketNumber)} style={{ cursor: 'pointer' }}>
                    <td className="fw-semibold">{t.ticketNumber}</td>
                    <td>{formatDate(t.createdAt)}</td>
                    <td>{t.summary}</td>
                    <td>{t.categoryName}</td>
                    <td><PriorityBadge value={t.requestedPriority} /></td>
                    <td><PriorityBadge value={t.itPriority} /></td>
                    <td><StatusBadge value={t.currentStatus} /></td>
                    <td>{t.ticketOwner ? t.ticketOwner.name : <span className="text-muted">Unassigned</span>}</td>
                    <td>{formatDate(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="d-lg-none d-flex flex-column gap-3">
            {result.data.map((t) => (
              <div
                key={t.id}
                className="zg-card p-3"
                onClick={() => openTicket(t.ticketNumber)}
                style={{ cursor: 'pointer' }}
              >
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="fw-semibold">{t.ticketNumber}</span>
                  <StatusBadge value={t.currentStatus} />
                </div>
                <p className="mb-2">{t.summary}</p>
                <div className="small text-muted d-flex flex-column gap-1">
                  <span>Category: {t.categoryName}</span>
                  <span>
                    Requested: <PriorityBadge value={t.requestedPriority} /> · IT: <PriorityBadge value={t.itPriority} />
                  </span>
                  <span>Owner: {t.ticketOwner ? t.ticketOwner.name : 'Unassigned'}</span>
                  <span>Updated: {formatDate(t.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-4">
            <span className="text-muted small">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, result.pagination.totalItems)} of{' '}
              {result.pagination.totalItems} tickets
            </span>
            <div className="d-flex align-items-center gap-2">
              <select
                className="form-select form-select-sm w-auto"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} / page
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-zg-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="small">
                Page {page} of {result.pagination.totalPages}
              </span>
              <button
                type="button"
                className="btn btn-zg-secondary btn-sm"
                disabled={page >= result.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
