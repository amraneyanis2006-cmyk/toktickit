import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/apiClient';
import { useRequester } from '../context/RequesterContext';

interface RefItem {
  id: number;
  name: string;
}

interface TicketRow {
  id: number;
  ticketNumber: string;
  summary: string;
  categoryName: string;
  requestedPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  itPriority: string | null;
  currentStatus: 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
  updatedAt: string;
}

interface TicketsResponse {
  data: TicketRow[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

type SortField = 'ticketNumber' | 'createdAt' | 'updatedAt';
type FetchState = 'loading' | 'success' | 'error';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'RESOLVED'];
const PAGE_SIZES = [10, 20, 50];

function PriorityBadge({ value }: { value: string }) {
  return <span className={`zg-badge zg-badge-priority-${value.toLowerCase()}`}>{value}</span>;
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`zg-badge zg-badge-status-${value.toLowerCase()}`}>{value.replace('_', ' ')}</span>;
}

export default function MyTickets() {
  const { requester } = useRequester();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<RefItem[]>([]);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [result, setResult] = useState<TicketsResponse | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [hasEverHadTickets, setHasEverHadTickets] = useState<boolean | null>(null);

  const filtersActive = Boolean(search || category || priority || status);

  const loadTickets = useCallback(async () => {
    setFetchState('loading');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (category) params.set('category', category);
      if (priority) params.set('priority', priority);
      if (status) params.set('status', status);
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));

      const res = await apiFetch<TicketsResponse>(`/tickets?${params.toString()}`, {
        requesterId: requester?.id,
      });
      setResult(res);
      setFetchState('success');

      // BR-26: distinguish "no tickets ever" vs "no results for these filters"
      if (!filtersActive) {
        setHasEverHadTickets(res.pagination.totalItems > 0);
      } else if (hasEverHadTickets === null) {
        // First load happened with filters already set (unlikely, but be safe):
        // treat unknown as "has tickets" so we show the No Results state, not Empty.
        setHasEverHadTickets(true);
      }
    } catch {
      setFetchState('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requester?.id, search, category, priority, status, sortBy, sortDir, page, pageSize]);

  useEffect(() => {
    apiFetch<RefItem[]>('/categories').then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

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
    setCategory('');
    setPriority('');
    setStatus('');
    setPage(1);
  };

  const sortCaret = (field: SortField) =>
    sortBy === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="zg-card p-4">
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-4">
        <div>
          <h1 className="h4 mb-1">My Tickets</h1>
          <p className="text-muted small mb-0">View and track the tickets you've submitted.</p>
        </div>
        <div className="d-flex gap-2">
          {filtersActive && (
            <button type="button" className="btn btn-zg-tertiary" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
          <Link to="/tickets/new" className="btn btn-zg-primary">
            + Create Ticket
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="row g-2 mb-4">
        <div className="col-12 col-md-4">
          <input
            type="search"
            className="form-control"
            placeholder="Search by ticket number or summary…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="col-6 col-md-2">
          <select
            className="form-select"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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
        <div className="col-6 col-md-2">
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
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {fetchState === 'error' && (
        <div className="zg-callout-error text-center py-4" role="alert">
          <p className="mb-3 fw-semibold">Unable to load tickets.</p>
          <button type="button" className="btn btn-zg-secondary" onClick={loadTickets}>
            Retry
          </button>
        </div>
      )}

      {fetchState === 'loading' && (
        <div className="text-center text-muted py-5">Loading tickets…</div>
      )}

      {fetchState === 'success' && result && result.data.length === 0 && !filtersActive && (
        <div className="text-center py-5">
          <p className="text-muted mb-3">You haven't created any tickets yet.</p>
          <Link to="/tickets/new" className="btn btn-zg-primary">
            + Create Ticket
          </Link>
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
          {/* Desktop table */}
          <div className="table-responsive d-none d-md-block">
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
                  <th>Current Status</th>
                  <th role="button" onClick={() => handleSort('updatedAt')}>
                    Last Updated{sortCaret('updatedAt')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/tickets/${t.ticketNumber}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="fw-semibold">{t.ticketNumber}</td>
                    <td>{formatDate(t.createdAt)}</td>
                    <td>{t.summary}</td>
                    <td>{t.categoryName}</td>
                    <td><PriorityBadge value={t.requestedPriority} /></td>
                    <td><StatusBadge value={t.currentStatus} /></td>
                    <td>{formatDate(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="d-md-none d-flex flex-column gap-3">
            {result.data.map((t) => (
              <div
                key={t.id}
                className="zg-card p-3"
                onClick={() => navigate(`/tickets/${t.ticketNumber}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="fw-semibold">{t.ticketNumber}</span>
                  <StatusBadge value={t.currentStatus} />
                </div>
                <p className="mb-2">{t.summary}</p>
                <div className="small text-muted d-flex flex-column gap-1">
                  <span>Category: {t.categoryName}</span>
                  <span>Priority: <PriorityBadge value={t.requestedPriority} /></span>
                  <span>Created: {formatDate(t.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer: pagination */}
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-4">
            <span className="text-muted small">
              Showing {(page - 1) * pageSize + 1} to{' '}
              {Math.min(page * pageSize, result.pagination.totalItems)} of{' '}
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
