import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import RequireAuth from './components/RequireAuth';
import AppShell from './components/AppShell';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import MyTickets from './pages/MyTickets';
import CreateTicket from './pages/CreateTicket';
import TicketDetail from './pages/TicketDetail';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<RequireAuth />}>
            <Route path="/change-password" element={<ChangePassword />} />

            <Route element={<AppShell />}>
              <Route path="/tickets" element={<MyTickets />} />
              <Route path="/tickets/new" element={<CreateTicket />} />
              <Route path="/tickets/:ticketNumber" element={<TicketDetail />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/tickets" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
