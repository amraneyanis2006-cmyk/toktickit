import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * FR-03: a user flagged mustChangePassword cannot reach any screen other
 * than Change Password. Unauthenticated users are sent to Login.
 */
export default function RequireAuth() {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="text-center text-muted py-5">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}
