import { Navigate, Outlet } from 'react-router-dom';
import { useRequester } from '../context/RequesterContext';

/**
 * AC-02: Given no Development Requester is selected, when the user attempts to
 * open a Requester-scoped screen, then the Requester Selection screen is shown.
 */
export default function RequireRequester() {
  const { requester } = useRequester();

  if (!requester) {
    return <Navigate to="/select-requester" replace />;
  }

  return <Outlet />;
}
