import type { AuthUser } from '../context/AuthContext';

/**
 * Where a user lands after login / at "/" (App.tsx RootRedirect), based on
 * role (ui-spec.md sec 6: Requester -> My Tickets, IT Staff/Admin -> Ticket Queue).
 */
export function defaultRouteForRole(role: AuthUser['role']): string {
  switch (role) {
    case 'IT_STAFF':
    case 'ADMINISTRATOR':
      return '/staff/tickets';
    case 'REQUESTER':
    default:
      return '/tickets';
  }
}
