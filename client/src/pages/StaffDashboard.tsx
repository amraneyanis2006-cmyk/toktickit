import { Link } from 'react-router-dom';
import { DashboardFrame, MetricCard, TicketList } from '../components/DashboardParts';
import type { TicketItem } from '../components/DashboardParts';
import { StatusBadge } from '../components/TicketWorkflow';
import { ActionStatusBadge } from '../components/ActionsTaken';
import type { ActionStatus } from '../components/ActionsTaken';
import { formatDateTime } from '../utils/actions';
import { ACTIVE_STATUSES } from '../utils/statusTransition';

// IT Staff / Administrator Dashboard (ui-spec sec 5). userAccounts is sent only to Administrators.

type Metric = { value: number; drillDown: string };
interface StaffData {
  generatedAt: string;
  metrics: Record<'unassignedOpen' | 'myOpenTickets' | 'awaitingReview' | 'highPriorityOpen' | 'myOpenActions', Metric>;
  byStatus: Record<string, number>;
  byItPriority: Record<'HIGH' | 'MEDIUM' | 'LOW' | 'NONE', number>;
  myOpenActionsList: Array<{
    id: number; ticketNumber: string; ticketSummary: string; description: string;
    status: ActionStatus; actionAt: string; followUpRequired: boolean;
  }>;
  urgentTickets: TicketItem[];
  recentTickets: TicketItem[];
  userAccounts?: { activeRequesters: number; activeItStaff: number; activeAdministrators: number; inactive: number };
}

const PRIORITY_LABEL = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', NONE: 'Not set' } as const;

export default function StaffDashboard() {
  return (
    <DashboardFrame<StaffData> endpoint="/dashboard/staff" cards={5}
      greeting="Welcome back, {name}!" subtitle="Here's what's happening with the queue.">
      {(d) => (
        <>
          <div className="row g-3 mb-4">
            {([
              ['Unassigned', d.metrics.unassignedOpen, 'unassigned tickets', 'No unassigned tickets.'],
              ['My Open Tickets', d.metrics.myOpenTickets, 'my open tickets', undefined],
              ['Awaiting Review', d.metrics.awaitingReview, 'tickets awaiting review', undefined],
              ['High Priority Open', d.metrics.highPriorityOpen, 'high priority open tickets', undefined],
              ['My Open Actions', d.metrics.myOpenActions, 'my open actions', undefined],
            ] as const).map(([label, metric, linkLabel, emptyText]) => (
              <div key={label} className="col-12 col-md-6 col-lg-4 col-xl">
                <MetricCard label={label} value={metric.value} to={metric.drillDown} linkLabel={linkLabel} emptyText={emptyText} />
              </div>
            ))}
          </div>

          <div className="row g-3 mb-4">
            <div className="col-12 col-lg-6">
              <section className="zg-card p-3 h-100">
                <h2 className="h6 mb-3">Tickets by Status</h2>
                <div className="d-flex flex-wrap gap-2">
                  {Object.entries(d.byStatus).map(([s, n]) => (
                    <Link key={s} to={`/staff/tickets?status=${s}`} className="d-inline-flex align-items-center gap-1 text-decoration-none text-body">
                      <StatusBadge value={s} /> <span className="fw-semibold">{n}</span>
                    </Link>
                  ))}
                </div>
              </section>
            </div>
            <div className="col-12 col-lg-6">
              <section className="zg-card p-3 h-100">
                <h2 className="h6 mb-3">Open Tickets by IT Priority</h2>
                <div className="d-flex flex-wrap gap-3">
                  {(['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const).map((p) => (
                    <Link key={p} to={`/staff/tickets?priority=${p}&status=${ACTIVE_STATUSES}`} className="text-decoration-none">
                      {PRIORITY_LABEL[p]} <span className="fw-semibold text-body">{d.byItPriority[p]}</span>
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-12 col-lg-6">
              <section id="my-open-actions" className="zg-card p-3 h-100">
                <h2 className="h6 mb-2">My Open Actions</h2>
                {d.myOpenActionsList.length === 0 ? (
                  <div className="zg-callout-neutral p-3">You have no open actions.</div>
                ) : (
                  <ul className="list-unstyled mb-0">
                    {d.myOpenActionsList.map((a) => (
                      <li key={a.id} className="py-2 border-bottom small">
                        <div className="text-truncate" title={a.description}>{a.description}</div>
                        <div className="d-flex flex-wrap align-items-center gap-2 mt-1">
                          <Link to={`/staff/tickets/${a.ticketNumber}`} className="fw-semibold">{a.ticketNumber}</Link>
                          <ActionStatusBadge status={a.status} />
                          {a.followUpRequired && <span className="zg-badge zg-badge-followup">Follow-up</span>}
                          <span className="text-muted text-nowrap">{formatDateTime(a.actionAt)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
            <div className="col-12 col-lg-6">
              <TicketList title="Urgent Tickets" base="/staff/tickets" tickets={d.urgentTickets} showOwner empty="No urgent tickets." />
            </div>
            <div className="col-12 col-lg-6">
              <TicketList title="Recently Updated" base="/staff/tickets" tickets={d.recentTickets} empty="No ticket was updated in the last 7 days." />
            </div>
            {d.userAccounts && (
              <div className="col-12 col-lg-6">
                <section className="zg-card p-3 h-100">
                  <h2 className="h6 mb-3">User Accounts</h2>
                  <ul className="list-unstyled mb-0">
                    {([
                      ['Active Requesters', d.userAccounts.activeRequesters, '?role=REQUESTER&isActive=true'],
                      ['Active IT Staff', d.userAccounts.activeItStaff, '?role=IT_STAFF&isActive=true'],
                      ['Active Administrators', d.userAccounts.activeAdministrators, '?role=ADMINISTRATOR&isActive=true'],
                      ['Inactive', d.userAccounts.inactive, '?isActive=false'],
                    ] as const).map(([label, n, query]) => (
                      <li key={label} className="py-1">
                        <Link to={`/admin/users${query}`} className="d-flex justify-content-between text-decoration-none">
                          <span>{label}</span> <span className="fw-semibold text-body">{n}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </div>
        </>
      )}
    </DashboardFrame>
  );
}
