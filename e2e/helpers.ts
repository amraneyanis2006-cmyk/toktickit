import { Page } from '@playwright/test';

/**
 * Logs in through the real Login screen (replaces the removed
 * Development Requester selector). Waits until the app has left /login,
 * i.e. defaultRouteForRole has redirected to the user's home screen.
 */
export async function login(page: Page, email: string, password: string) {
  // Ensure a clean, unauthenticated start. Navigating to /login while a
  // session cookie is still valid triggers Login.tsx's own redirect away
  // from /login (AuthContext still reports a user), which tears the form
  // down mid-fill. Logging out first via the API - it shares the page's
  // cookie jar - makes this helper safe to call repeatedly to switch
  // identities within a single test (e.g. Requester A, then Requester B).
  await page.request.post('http://localhost:3000/api/auth/logout').catch(() => {});
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}
