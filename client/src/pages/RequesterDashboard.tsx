import { Link } from 'react-router-dom';
import { DashboardFrame, MetricCard, TicketList } from '../components/DashboardParts';
import type { TicketItem } from '../components/DashboardParts';

// Requester Dashboard (ui-spec sec 4).

type Metric = { value: number; drillDown: string };
interface RequesterData {
  generatedAt: string;
  metrics: Record<'openTickets' | 'waitingForMe' | 'resolvedLast7Days' | 'closedTickets', Metric>;
  attentionTickets: TicketItem[];
  recentTickets: TicketItem[];
}

export default function RequesterDashboard() {
  return (
    <DashboardFrame<RequesterData> endpoint="/dashboard/requester" cards={4}
      greeting="Welcome, {name}!" subtitle="Here's the latest on your requests.">
      {({ metrics: m, attentionTickets, recentTickets }) => (
        <>
          <div className="row g-3 mb-4">
            {([
              ['Open', m.openTickets, 'open tickets'],
              ['Waiting for You', m.waitingForMe, 'tickets waiting for you'],
              ['Resolved (last 7 days)', m.resolvedLast7Days, 'tickets resolved (last 7 days)'],
              ['Closed', m.closedTickets, 'closed tickets'],
            ] as const).map(([label, metric, linkLabel]) => (
              <div key={label} className="col-12 col-md-6 col-lg-4 col-xl">
                <MetricCard label={label} value={metric.value} to={metric.drillDown} linkLabel={linkLabel}
                  attention={metric === m.waitingForMe && metric.value > 0} />
              </div>
            ))}
          </div>
          <div className="row g-3">
            <div className="col-12 col-lg-6">
              <TicketList title="Needs Your Attention" hint="IT Staff are waiting for your reply" base="/tickets"
                tickets={attentionTickets} empty="Nothing needs your attention right now." />
            </div>
            <div className="col-12 col-lg-6">
              <TicketList title="Recently Updated" base="/tickets" tickets={recentTickets}
                empty={<>
                  <p className="mb-2">You haven't created any tickets yet.</p>
                  <Link to="/tickets/new" className="btn btn-sm btn-zg-primary">+ Create Ticket</Link>
                </>}
                footer={recentTickets.length > 0 && <Link to="/tickets" className="small d-inline-block mt-2" aria-label="View all my tickets">View all</Link>} />
            </div>
            <div className="col-12">
              <section className="zg-card p-3">
                <h2 className="h6 mb-3">Quick Actions</h2>
                <div className="d-flex flex-wrap gap-2">
                  <Link to="/tickets/new" className="btn btn-zg-primary">Create Ticket</Link>
                  <Link to="/tickets" className="btn btn-zg-secondary">View My Tickets</Link>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </DashboardFrame>
  );
}
