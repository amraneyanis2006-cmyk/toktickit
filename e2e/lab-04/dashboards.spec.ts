import { test, expect } from '@playwright/test';
import { login } from '../helpers';
import { E2E_ADMIN, E2E_REQUESTER_EMPTY, E2E_REQUESTER_L4, E2E_STAFF_A, E2E_STAFF_IDLE, FIXTURE_PASSWORD } from '../global-setup';
import { API, VIEWPORTS, listTotal, metric, noHorizontalScroll, nothingClipped } from './lab4';

const ACTIVE = 'NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED';

test.use({ viewport: { width: 1280, height: 900 } });

test.describe('E2E-01: every role lands on /dashboard', () => {
  for (const [who, heading] of [
    [E2E_REQUESTER_L4, 'Welcome, E2E!'],
    [E2E_STAFF_A, 'Welcome back, E2E!'],
    [E2E_ADMIN, 'Welcome back, E2E!'],
  ] as const) {
    test(`E2E-01: ${who.email} lands on /dashboard with "Dashboard" active`, async ({ page }) => {
      await login(page, who.email, FIXTURE_PASSWORD);
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('aria-current', 'page');
    });
  }
});

test.describe('E2E-06: dashboard drill-down', () => {
  // Other specs change tickets in parallel, so each card/list pair is compared until both
  // reads agree (re-reading the card each time); a real mismatch still fails after the timeout.
  async function cardEqualsList(page: import('@playwright/test').Page, label: string, linkName: string, total: () => Promise<number>) {
    await expect(async () => {
      await page.goto('/dashboard');
      const value = Number(await metric(page, label).textContent());
      await page.getByRole('link', { name: linkName }).click();
      await expect(page.getByText('Filtered from Dashboard')).toBeVisible();
      expect(await total(), label).toBe(value);
    }).toPass({ timeout: 30_000 });
  }

  test('E2E-06: each staff card opens a Ticket Queue whose total equals the card value', async ({ page }) => {
    await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
    for (const [label, link] of [
      ['Unassigned', 'View all unassigned tickets'],
      ['My Open Tickets', 'View all my open tickets'],
      ['Awaiting Review', 'View all tickets awaiting review'],
      ['High Priority Open', 'View all high priority open tickets'],
    ]) await cardEqualsList(page, label, link, () => listTotal(page));
  });

  test('E2E-06: each Requester card opens My Tickets with the same total', async ({ page }) => {
    await login(page, E2E_REQUESTER_L4.email, FIXTURE_PASSWORD);
    for (const [label, link] of [
      ['Open', 'View all open tickets'],
      ['Waiting for You', 'View all tickets waiting for you'],
      ['Resolved (last 7 days)', 'View all tickets resolved (last 7 days)'],
      ['Closed', 'View all closed tickets'],
    ]) await cardEqualsList(page, label, link, () => listTotal(page));
  });

  test('E2E-06: each User Accounts link opens User Management with as many users as the count', async ({ page }) => {
    await login(page, E2E_ADMIN.email, FIXTURE_PASSWORD);
    for (const label of ['Active Requesters', 'Active IT Staff', 'Active Administrators', 'Inactive']) {
      await expect(async () => {
        await page.goto('/dashboard');
        const link = page.getByRole('link', { name: new RegExp(`^${label} \\d+$`) });
        const value = Number((await link.textContent())!.match(/(\d+)$/)![1]);
        await link.click();
        await expect(page.getByText('Filtered from Dashboard')).toBeVisible();
        const rows = page.locator('.table-responsive tbody tr');
        await expect(rows.first().or(page.getByText('No users match your search.'))).toBeVisible();
        expect(await rows.count(), label).toBe(value);
      }).toPass({ timeout: 30_000 });
    }
  });
});

test.describe('E2E-07: Requester dashboards', () => {
  test('E2E-07: the fixture Requester sees only their own tickets', async ({ page }) => {
    await login(page, E2E_REQUESTER_L4.email, FIXTURE_PASSWORD);
    const recent = page.locator('section', { has: page.getByRole('heading', { name: 'Recently Updated' }) });
    await expect(recent.getByRole('link', { name: /^TKT-/ }).first()).toBeVisible();
    for (const n of await recent.getByRole('link', { name: /^TKT-/ }).allTextContents()) expect(n).toMatch(/^TKT-L4E-/);
    // The Open count is the Requester's own: it equals their own active tickets from GET /api/tickets.
    await expect(async () => {
      await page.goto('/dashboard');
      const own = await (await page.request.get(`${API}/tickets?status=${ACTIVE}&pageSize=10`)).json();
      expect(Number(await metric(page, 'Open').textContent())).toBe(own.pagination.totalItems);
    }).toPass({ timeout: 30_000 });
  });

  test('E2E-07: a Requester with no tickets sees zeros and empty states, not errors', async ({ page }) => {
    await login(page, E2E_REQUESTER_EMPTY.email, FIXTURE_PASSWORD);
    for (const label of ['Open', 'Waiting for You', 'Resolved (last 7 days)', 'Closed']) await expect(metric(page, label)).toHaveText('0');
    await expect(page.getByText('Nothing needs your attention right now.')).toBeVisible();
    await expect(page.getByText("You haven't created any tickets yet.")).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('E2E-07: a staff member with no open actions sees the empty list', async ({ page }) => {
    await login(page, E2E_STAFF_IDLE.email, FIXTURE_PASSWORD);
    await expect(metric(page, 'My Open Actions')).toHaveText('0');
    await expect(page.getByText('You have no open actions.')).toBeVisible();
  });
});

test.describe('RESP-01: dashboards at 320 / 768 / 1280', () => {
  for (const vp of VIEWPORTS) {
    for (const [who, cards] of [[E2E_REQUESTER_L4, 4], [E2E_STAFF_A, 5]] as const) {
      test(`RESP-01: ${who.email} dashboard at ${vp.name}: no horizontal scroll, cards per row`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await login(page, who.email, FIXTURE_PASSWORD);
        await expect(page.locator('.zg-metric-value')).toHaveCount(cards);
        await noHorizontalScroll(page);
        await nothingClipped(page, '.zg-card');
        const tops = await page.locator('.zg-metric').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
        const firstRow = tops.filter((t) => t === tops[0]).length;
        expect(firstRow).toBe(vp.width >= 1200 ? cards : vp.width >= 768 ? 2 : 1);
      });
    }
  }
});

test.describe('A11Y-02: dashboard semantics', () => {
  test('A11Y-02: one h1, card h2s, "View all" links named after their metric, aria-current on Dashboard', async ({ page }) => {
    await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
    await expect(page.locator('.zg-metric-value')).toHaveCount(5);
    await expect(page.locator('h1')).toHaveCount(1);
    expect(await page.locator('.zg-metric h2').count()).toBe(5);
    const names = await page.getByRole('link', { name: /^View all / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(names).toEqual(expect.arrayContaining(['View all unassigned tickets', 'View all my open actions']));
    await expect(page.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('FAIL-01: dashboard API failure', () => {
  test('FAIL-01: an aborted dashboard request shows the safe message, and Retry recovers', async ({ page }) => {
    await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
    await page.route('**/api/dashboard/staff', (route) => route.abort());
    await page.getByRole('button', { name: 'Refresh dashboard' }).click();
    await expect(page.getByText("We couldn't load your dashboard.")).toBeVisible();
    await page.unroute('**/api/dashboard/staff');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('.zg-metric-value')).toHaveCount(5);
    await expect(page.getByText("We couldn't load your dashboard.")).toBeHidden();
  });
});
