import { useAuth } from '../context/AuthContext';
import RequesterDashboard from './RequesterDashboard';
import StaffDashboard from './StaffDashboard';

/** /dashboard for every role (BR-28): Administrators get the staff dashboard plus User Accounts. */
export default function Dashboard() {
  const { user } = useAuth();
  return user?.role === 'REQUESTER' ? <RequesterDashboard /> : <StaffDashboard />;
}
