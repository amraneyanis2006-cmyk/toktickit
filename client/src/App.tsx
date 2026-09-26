import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import RequireAuth from './components/RequireAuth';
import RequireRole from './components/RequireRole';
import AppShell from './components/AppShell';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import MyTickets from './pages/MyTickets';
import CreateTicket from './pages/CreateTicket';
import TicketDetail from './pages/TicketDetail';
import StaffTicketQueue from './pages/StaffTicketQueue';
import { defaultRouteForRole } from './utils/roleRoutes';

function RootRedirect() {
  const { user, status } = useAuth();
  if (status === 'loading') return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={defaultRouteForRole(user.role)} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<RequireAuth />}>
            <Route path="/change-password" element={<ChangePassword />} />

            <Route element={<AppShell />}>
              <Route element={<RequireRole allowedRoles={['REQUESTER']} />}>
                <Route path="/tickets" element={<MyTickets />} />
                <Route path="/tickets/new" element={<CreateTicket />} />
                <Route path="/tickets/:ticketNumber" element={<TicketDetail />} />
              </Route>

              <Route element={<RequireRole allowedRoles={['IT_STAFF', 'ADMINISTRATOR']} />}>
                <Route path="/staff/tickets" element={<StaffTicketQueue />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
