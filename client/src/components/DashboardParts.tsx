import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from './TicketWorkflow';

// Shared dashboard building blocks (ui-spec sec 3). Values always come from the API.

export function MetricCard({ label, value, to, linkLabel, emptyText = 'Nothing here', attention = false }: {
  label: string; value: number; to: string; linkLabel: string; emptyText?: string; attention?: boolean;
}) {
  const link = { className: 'small', 'aria-label': `View all ${linkLabel}` };
  return (
    <div className={`zg-card zg-metric${attention ? ' zg-metric-attention' : ''}`}>
      <h2>{label}</h2>
      <div className="zg-metric-value" aria-live="polite">{value}</div>
      {value === 0 && <div className="small text-muted">{emptyText}</div>}
      {to.startsWith('#') ? <a href={to} {...link}>View all</a> : <Link to={to} {...link}>View all</Link>}
    </div>
  );
}

export interface TicketItem {
  ticketNumber: string;
  summary: string;
  currentStatus: string;
  updatedAt?: string;
  createdAt?: string;
  ticketOwner?: { name: string } | null;
}

export function TicketList({ title, tickets, empty, base, hint, showOwner = false, footer }: {
  title: string; tickets: TicketItem[]; empty: ReactNode; base: string; hint?: string; showOwner?: boolean; footer?: ReactNode;
}) {
  return (
    <section className="zg-card p-3 h-100">
      <h2 className="h6 mb-1">{title}</h2>
      {hint && <p className="small text-muted mb-2">{hint}</p>}
      {tickets.length === 0 ? (
        <div className="zg-callout-neutral p-3 mt-2">{empty}</div>
      ) : (
        <ul className="list-unstyled mb-0 mt-2">
          {tickets.map((t) => (
            <li key={t.ticketNumber} className="d-flex flex-wrap align-items-center gap-2 py-2 border-bottom">
              <Link to={`${base}/${t.ticketNumber}`} className="fw-semibold small">{t.ticketNumber}</Link>
              <span className="text-truncate small flex-grow-1" style={{ minWidth: 0, flexBasis: '8rem' }} title={t.summary}>{t.summary}</span>
              <StatusBadge value={t.currentStatus} />
              {showOwner && <span className="small text-muted">{t.ticketOwner?.name ?? 'Unassigned'}</span>}
              <span className="small text-muted text-nowrap">{formatDay((t.updatedAt ?? t.createdAt)!)}</span>
            </li>
          ))}
        </ul>
      )}
      {footer}
    </section>
  );
}

const formatDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Removable chip shown when a list was opened from a dashboard card (ui-spec sec 5). */
export function DashboardChip({ onRemove }: { onRemove: () => void }) {
  return (
    <span className="zg-badge zg-chip d-inline-flex align-items-center gap-1 mb-3">
      <span>Filtered from Dashboard</span>
      <button type="button" className="btn btn-sm p-0 border-0 lh-1" style={{ color: 'inherit' }} onClick={onRemove}
        aria-label="Remove filter: Filtered from Dashboard">&#x2715;</button>
    </span>
  );
}

/** Header, Refresh, loading skeleton and failure state around a dashboard body. */
export function DashboardFrame<T extends { generatedAt: string }>({ endpoint, greeting, subtitle, cards, children }: {
  endpoint: string; greeting: string; subtitle: string; cards: number; children: (data: T) => ReactNode;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');

  const fetchData = useCallback(() => apiFetch<T>(endpoint).then(
    (d) => { setData(d); setState('ready'); },
    () => setState('error'),
  ), [endpoint]);
  const load = () => { setState('loading'); fetchData(); };

  useEffect(() => {
    fetchData(); // state starts as 'loading'
  }, [fetchData]);

  const firstName = user?.name.split(' ')[0] ?? '';
  return (
    <div>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-4">
        <div>
          <h1 className="h4 mb-1">{greeting.replace('{name}', firstName)}</h1>
          <p className="text-muted small mb-0">{subtitle}</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          {data && <span className="small text-muted">Updated at {new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          <button type="button" className="btn btn-zg-secondary" onClick={load} disabled={state === 'loading'} aria-label="Refresh dashboard">Refresh</button>
        </div>
      </div>

      {state === 'error' && (
        <div className="zg-callout-error text-center py-4" role="alert">
          <p className="mb-3 fw-semibold">We couldn't load your dashboard.</p>
          <button type="button" className="btn btn-zg-secondary" onClick={load}>Retry</button>
        </div>
      )}
      {state === 'loading' && !data && (
        <div className="row g-3" aria-busy="true" aria-label="Loading dashboard">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="col-12 col-md-6 col-lg-4 col-xl">
              <div className="zg-card zg-metric placeholder-glow" aria-hidden="true">
                <span className="placeholder col-6" /><span className="placeholder col-3" style={{ height: 38 }} /><span className="placeholder col-8" />
              </div>
            </div>
          ))}
        </div>
      )}
      {state !== 'error' && data && children(data)}
    </div>
  );
}
