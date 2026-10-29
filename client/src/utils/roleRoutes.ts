/**
 * Where a user lands after login / at "/" (App.tsx RootRedirect) and after a
 * forbidden route: every role lands on its Dashboard (Lab 4 CHG-01, BR-28).
 */
export function defaultRouteForRole(): string {
  return '/dashboard';
}
