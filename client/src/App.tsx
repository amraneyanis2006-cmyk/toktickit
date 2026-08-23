import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RequesterProvider } from './context/RequesterContext';
import RequireRequester from './components/RequireRequester';
import AppShell from './components/AppShell';
import RequesterSelection from './pages/RequesterSelection';
import MyTickets from './pages/MyTickets';
import CreateTicket from './pages/CreateTicket';

export default function App() {
  return (
    <RequesterProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/select-requester" element={<RequesterSelection />} />

          <Route element={<RequireRequester />}>
            <Route element={<AppShell />}>
              <Route path="/tickets" element={<MyTickets />} />
              <Route path="/tickets/new" element={<CreateTicket />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/tickets" replace />} />
        </Routes>
      </BrowserRouter>
    </RequesterProvider>
  );
}
