import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { AuthUser } from '../context/AuthContext';
import { defaultRouteForRole } from '../utils/roleRoutes';

interface RequireRoleProps {
  allowedRoles: AuthUser['role'][];
}

/**
 * Route guard for role-restricted screens. Must run INSIDE RequireAuth
 * (assumes the user is already authenticated with mustChangePassword=false).
 * A role mismatch redirects to the user's own home rather than rendering a
 * blank page (ui-spec.md sec 7 "forbidden" state) - a hidden button is not
 * a security control, and this is UX only: the server enforces the real
 * boundary via requireRole.
 */
export default function RequireRole({ allowedRoles }: RequireRoleProps) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <Navigate to={defaultRouteForRole(user.role)} replace state={{ forbiddenFrom: location.pathname }} />
    );
  }

  return <Outlet />;
}
