import type { AuthUser } from '../context/AuthContext';

/**
 * Where a user lands after login / at "/" (App.tsx RootRedirect), based on role:
 * Requester -> My Tickets, IT Staff -> Ticket Queue, Administrator -> User
 * Management (their primary function; Ticket Queue stays in their navigation).
 */
export function defaultRouteForRole(role: AuthUser['role']): string {
  switch (role) {
    case 'ADMINISTRATOR':
      return '/admin/users';
    case 'IT_STAFF':
      return '/staff/tickets';
    case 'REQUESTER':
    default:
      return '/tickets';
  }
}
