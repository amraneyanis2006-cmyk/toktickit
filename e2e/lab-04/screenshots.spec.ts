// SHOT-01 (ui-spec sec 10): every checklist screen at 1280x900, 768x1024 and 320x800 into
// artifacts/lab-04/screenshots/<group>/<NN>-<state>-<viewport>[-simulated].png, plus INDEX.md.
// States that cannot happen on demand (loading, empty staff dashboard, failure) are produced
// with page.route and their file names end in "-simulated".
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { login } from '../helpers';
import {
  E2E_ADMIN, E2E_REQUESTER_A, E2E_REQUESTER_EMPTY, E2E_REQUESTER_L4, E2E_STAFF_A, E2E_STAFF_LEAVING_SHOT, FIXTURE_PASSWORD, L4,
} from '../global-setup';
import { API, VIEWPORTS, listTotal, metric, openStaffTicket, setUserActive, viewAction } from './lab4';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../../artifacts/lab-04/screenshots');
const IMAGE = path.join(__dirname, '../lab-02/fixtures/test-image.png');

// One worker, in order: several scenarios reuse a fixture ticket across the three viewports.
test.describe.configure({ mode: 'default' });

type Viewport = (typeof VIEWPORTS)[number];
interface Shot { group: string; nn: string; state: string; what: string; simulated?: boolean }
const INDEX: Shot[] = [];

/** Registers a screenshot (for INDEX.md) and returns a function that takes it at a viewport. */
function shot(group: string, nn: string, state: string, what: string, simulated = false) {
  INDEX.push({ group, nn, state, what, simulated });
  return (page: Page, vp: Viewport, fullPage = true) =>
    page.screenshot({ path: path.join(ROOT, group, `${nn}-${state}-${vp.name}${simulated ? '-simulated' : ''}.png`), fullPage });
}

/** Action panel states: below 768 px the panel is a fixed full-screen sheet, so capture the viewport. */
const sheet = (vp: Viewport) => vp.width >= 768;

/** Runs `body` once per viewport, logged in as `email`. */
function scenario(title: string, email: string, body: (page: Page, vp: Viewport) => Promise<void>) {
  test(`SHOT-01: ${title}`, async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, email, FIXTURE_PASSWORD);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await body(page, vp);
    }
  });
}

async function apiCreateAction(page: Page, ticketNumber: string, description: string) {
  const res = await page.request.post(`${API}/staff/tickets/${ticketNumber}/actions`, {
    data: { actionAt: new Date().toISOString(), description, performedById: null, clientRequestId: crypto.randomUUID() },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()) as { id: number; updatedAt: string };
}

async function apiActionStatus(page: Page, ticketNumber: string, a: { id: number; updatedAt: string }, status: string, result?: string) {
  const res = await page.request.patch(`${API}/staff/tickets/${ticketNumber}/actions/${a.id}/status`, {
    data: { status, expectedUpdatedAt: a.updatedAt, ...(result ? { result } : {}) },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()) as { id: number; updatedAt: string };
}

async function apiTicketStatus(page: Page, ticketNumber: string, currentStatus: string) {
  const res = await page.request.patch(`${API}/staff/tickets/${ticketNumber}/status`, { data: { currentStatus } });
  expect(res.ok(), await res.text()).toBe(true);
}

const dashboardsLoaded = (page: Page, cards: number) => expect(page.locator('.zg-metric-value')).toHaveCount(cards);

// ---------------------------------------------------------------- staff dashboard
const sd = 'staff-dashboard';
const sdPopulated = shot(sd, '01', 'populated', 'IT Staff dashboard with real data: 5 cards, status and priority counts, lists.');
const sdLoading = shot(sd, '02', 'loading', 'Loading skeleton (aria-busy) while the dashboard request is pending.', true);
const sdEmpty = shot(sd, '03', 'empty', 'Staff dashboard with zero values and every empty-state text.', true);
const sdFailure = shot(sd, '04', 'failure', '"We couldn\'t load your dashboard." with Retry after the request fails.', true);
const sdForbidden = shot(sd, '05', 'forbidden-requester', 'A Requester opening a staff-only URL is redirected to their own dashboard.');
const sdAdmin = shot(sd, '06', 'admin', 'Administrator dashboard: the staff dashboard plus the User Accounts card.');
const sdCard = shot(sd, '07', 'drilldown-card', 'Drill-down source: the "Unassigned" card value.', false);
const sdList = shot(sd, '08', 'drilldown-queue', 'Drill-down target: the Ticket Queue filtered from the card, same total, with the chip.');

scenario('staff dashboard states', E2E_STAFF_A.email, async (page, vp) => {
  await page.goto('/dashboard');
  await dashboardsLoaded(page, 5);
  await sdPopulated(page, vp);

  await page.route('**/api/dashboard/staff', () => {}); // never answers
  await page.goto('/dashboard');
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  await sdLoading(page, vp);
  await page.unroute('**/api/dashboard/staff');

  await page.route('**/api/dashboard/staff', async (route) => {
    const body = await (await route.fetch()).json();
    for (const m of Object.values(body.metrics) as Array<{ value: number }>) m.value = 0;
    for (const k of Object.keys(body.byStatus)) body.byStatus[k] = 0;
    for (const k of Object.keys(body.byItPriority)) body.byItPriority[k] = 0;
    await route.fulfill({ json: { ...body, myOpenActionsList: [], urgentTickets: [], recentTickets: [] } });
  });
  await page.goto('/dashboard');
  await expect(page.getByText('You have no open actions.')).toBeVisible();
  await sdEmpty(page, vp);
  await page.unroute('**/api/dashboard/staff');

  await page.route('**/api/dashboard/staff', (route) => route.abort());
  await page.goto('/dashboard');
  await expect(page.getByText("We couldn't load your dashboard.")).toBeVisible();
  await sdFailure(page, vp);
  await page.unroute('**/api/dashboard/staff');

  // Retried like E2E-06: other specs may change the counts between the two reads.
  await expect(async () => {
    await page.goto('/dashboard');
    await dashboardsLoaded(page, 5);
    const value = Number(await metric(page, 'Unassigned').textContent());
    await sdCard(page, vp, false);
    await page.getByRole('link', { name: 'View all unassigned tickets' }).click();
    expect(await listTotal(page)).toBe(value);
  }).toPass({ timeout: 30_000 });
  await sdList(page, vp);
});

scenario('forbidden route for a Requester', E2E_REQUESTER_L4.email, async (page, vp) => {
  await page.goto('/staff/tickets');
  await expect(page).toHaveURL(/\/dashboard$/);
  await dashboardsLoaded(page, 4);
  await sdForbidden(page, vp);
});

scenario('Administrator dashboard', E2E_ADMIN.email, async (page, vp) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'User Accounts' })).toBeVisible();
  await sdAdmin(page, vp);
});

// ---------------------------------------------------------------- requester dashboard
const rd = 'requester-dashboard';
const rdPopulated = shot(rd, '01', 'populated', 'Requester dashboard with 4 cards, Needs Your Attention, Recently Updated and Quick Actions.');
const rdEmpty = shot(rd, '02', 'empty', 'Requester with no tickets: zeros and the empty-state texts.');
const rdFailure = shot(rd, '03', 'failure', 'Requester dashboard failure message with Retry.', true);
const rdCard = shot(rd, '04', 'drilldown-card', 'Drill-down source: the "Open" card value.');
const rdList = shot(rd, '05', 'drilldown-my-tickets', 'Drill-down target: My Tickets filtered from the card, same total, with the chip.');

scenario('requester dashboard states', E2E_REQUESTER_L4.email, async (page, vp) => {
  await page.goto('/dashboard');
  await dashboardsLoaded(page, 4);
  await rdPopulated(page, vp);

  await page.route('**/api/dashboard/requester', (route) => route.abort());
  await page.goto('/dashboard');
  await expect(page.getByText("We couldn't load your dashboard.")).toBeVisible();
  await rdFailure(page, vp);
  await page.unroute('**/api/dashboard/requester');

  await expect(async () => {
    await page.goto('/dashboard');
    await dashboardsLoaded(page, 4);
    const value = Number(await metric(page, 'Open').textContent());
    await rdCard(page, vp, false);
    await page.getByRole('link', { name: 'View all open tickets' }).click();
    expect(await listTotal(page)).toBe(value);
  }).toPass({ timeout: 30_000 });
  await rdList(page, vp);
});

scenario('requester dashboard empty', E2E_REQUESTER_EMPTY.email, async (page, vp) => {
  await page.goto('/dashboard');
  await expect(page.getByText('Nothing needs your attention right now.')).toBeVisible();
  await rdEmpty(page, vp);
});

// ---------------------------------------------------------------- actions taken
const at = 'actions-taken';
const atList = shot(at, '01', 'list-several-actions', 'One ticket with actions in every status: table at 1280, cards below 992 px; locked rows.');
const atCreate = shot(at, '02', 'create-panel', 'Add Action panel (full-screen sheet below 768 px).');
const atFollowUp = shot(at, '03', 'validation-follow-up-note', 'Follow-up checked without a note: error under the field, nothing saved.');
const atFuture = shot(at, '04', 'validation-future-date', 'Date in the future: the server error shown under Action Date/Time, nothing saved.');
const atInactive = shot(at, '05', 'inactive-assignee', 'Performed by a staff member deactivated meanwhile: error under Performed by.');
const atEdit = shot(at, '06', 'edit', 'Editing an open action (unsaved change; Start/Complete/Cancel wait for Save).');
const atStart = shot(at, '07', 'started', 'After Start: the action is In Progress.');
const atComplete = shot(at, '08', 'complete-with-result', 'Completing an action: the Result is filled in before Complete.');
const atCompleted = shot(at, '09', 'completed', 'After Complete: Completed badge, Locked, result shown.');
const atCancel = shot(at, '10', 'cancel-dialog', 'Cancel action confirmation dialog.');
const atLocked = shot(at, '11', 'locked-action', 'A completed action opened: every field read-only.');
const atStale = shot(at, '12', 'stale-update', 'Stale save: "Someone else updated this action", latest values and the unsaved text.');
const atRequester = shot(at, '13', 'requester-read-only', 'Requester Ticket Detail: "Work done on your ticket", read-only, plus Status History.');

scenario('actions taken list and locked action', E2E_STAFF_A.email, async (page, vp) => {
  await openStaffTicket(page, L4.severalActions);
  await atList(page, vp);
  await viewAction(page, 'Checked the access point logs');
  await atLocked(page, vp, sheet(vp));
});

scenario('create panel, validation and inactive assignee', E2E_STAFF_A.email, async (page, vp) => {
  await openStaffTicket(page, L4.shotCreate);
  await page.getByRole('button', { name: 'Add Action' }).click();
  await atCreate(page, vp, sheet(vp));
  await page.getByLabel(/Action Description/).fill('Check the docking station');
  await page.getByLabel('Follow-up Required?').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#followUpNote-error')).toBeVisible();
  await atFollowUp(page, vp, sheet(vp));

  await page.getByLabel(/Follow-up Note/).fill('Check again next week.');
  const future = new Date(Date.now() + 2 * 24 * 3600_000);
  await page.getByLabel(/Action Date\/Time/).fill(new Date(future.getTime() - future.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#actionAt-error')).toBeVisible();
  await atFuture(page, vp, sheet(vp));

  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Add Action' }).click();
  await page.getByLabel(/Action Description/).fill('Hand over to the leaving colleague');
  await page.getByLabel(/Performed by/).selectOption({ label: E2E_STAFF_LEAVING_SHOT.name });
  await setUserActive(E2E_STAFF_LEAVING_SHOT.email, false);
  try {
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#performedById-error')).toBeVisible();
    await atInactive(page, vp, sheet(vp));
  } finally {
    await setUserActive(E2E_STAFF_LEAVING_SHOT.email, true);
  }
  await page.getByRole('button', { name: 'Close' }).click();
});

scenario('edit, start, complete, cancel dialog', E2E_STAFF_A.email, async (page, vp) => {
  const desc = `Swap the monitor (${vp.name})`;
  await apiCreateAction(page, L4.shotComplete, desc);
  await openStaffTicket(page, L4.shotComplete);
  await viewAction(page, desc);
  await page.getByLabel(/Attachment Notes/).fill('monitor-serial.jpg');
  await atEdit(page, vp, sheet(vp));
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('region', { name: 'Action details' })).toBeHidden();
  // Wait for the reloaded list before reopening, so the panel carries the new updatedAt.
  const row = page.locator('tbody tr, .d-lg-none .zg-card', { hasText: desc }).filter({ visible: true }).first();
  await expect(row).toContainText('monitor-serial.jpg');

  await viewAction(page, desc);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('region', { name: 'Action details' })).toBeHidden();
  await expect(row).toContainText('In Progress');
  await atStart(page, vp);

  await viewAction(page, desc);
  await page.getByLabel(/^Result/).fill('New monitor installed and tested.');
  await atComplete(page, vp, sheet(vp));
  await page.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByRole('region', { name: 'Action details' })).toBeHidden();
  await atCompleted(page, vp);

  await viewAction(page, 'Schedule a follow-up call');
  await page.getByRole('button', { name: 'Cancel action' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await atCancel(page, vp, false);
  await page.getByRole('button', { name: 'Keep action' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
});

scenario('stale update', E2E_STAFF_A.email, async (page, vp) => {
  const desc = `Call the Requester (${vp.name})`;
  const created = await apiCreateAction(page, L4.shotStale, desc);
  await openStaffTicket(page, L4.shotStale);
  await viewAction(page, desc);
  // Someone else saves first.
  const res = await page.request.patch(`${API}/staff/tickets/${L4.shotStale}/actions/${created.id}`, {
    data: { description: `${desc} - updated by a colleague`, expectedUpdatedAt: created.updatedAt },
  });
  expect(res.ok(), await res.text()).toBe(true);
  await page.getByLabel(/Action Description/).fill(`${desc} - my version`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Someone else updated this action. The latest version is shown.')).toBeVisible();
  await atStale(page, vp, sheet(vp));
  await page.getByRole('button', { name: 'Close' }).click();
});

scenario('requester read-only view', E2E_REQUESTER_L4.email, async (page, vp) => {
  await page.goto(`/tickets/${L4.severalActions}`);
  await expect(page.getByRole('heading', { name: 'Work done on your ticket' })).toBeVisible();
  await atRequester(page, vp);
});

// ---------------------------------------------------------------- ticket workflow
const tw = 'ticket-workflow';
const twBlockedOption = shot(tw, '01', 'legal-options-resolved-disabled', 'Status control: only legal targets, Resolved disabled with the gate reason.');
const twBlocked = shot(tw, '02', 'resolution-blocked', 'RESOLUTION_BLOCKED from the server (an open action was added meanwhile); select reset.');
const twResolved = shot(tw, '03', 'resolved-success', 'Successful resolve: badge, "Resolved on", success message and Status History refreshed.');
const twBanner = shot(tw, '04', 'awaiting-review-banner', 'Requester says resolved: awaiting-review badge and banner on an active ticket.');
const twCancelDialog = shot(tw, '05', 'cancel-dialog-open-actions', 'Ticket cancel dialog with "This also cancels 1 open action."');
const twCancelled = shot(tw, '06', 'cancelled-actions-refreshed', 'After the ticket cancel: status Cancelled, the open action shown as Cancelled.');

scenario('legal options and awaiting review', E2E_STAFF_A.email, async (page, vp) => {
  await openStaffTicket(page, L4.noAction);
  await expect(page.getByText('To resolve, complete at least one action and close all open actions.')).toBeVisible();
  // Show the options of the native select as a list box so they are visible in the image.
  await page.getByLabel('Current Status').evaluate((s: HTMLSelectElement) => { s.size = s.options.length; });
  await twBlockedOption(page, vp);

  await openStaffTicket(page, L4.awaitingReview);
  await expect(page.getByText('Requester says resolved', { exact: true })).toBeVisible();
  await twBanner(page, vp);
});

scenario('resolution blocked, then resolved', E2E_STAFF_A.email, async (page, vp) => {
  await openStaffTicket(page, L4.shotResolve);
  const open = await apiCreateAction(page, L4.shotResolve, `Last check (${vp.name})`); // after the page loaded its gate
  await page.getByLabel('Current Status').selectOption('RESOLVED');
  await expect(page.getByRole('alert').filter({ hasText: /cannot be resolved|open actions/i })).toBeVisible();
  await twBlocked(page, vp);

  await apiActionStatus(page, L4.shotResolve, open, 'CANCELLED');
  await openStaffTicket(page, L4.shotResolve);
  await page.getByLabel('Current Status').selectOption('RESOLVED');
  await expect(page.getByRole('status')).toHaveText('Status changed to Resolved.');
  await twResolved(page, vp);
  // Back to IN_PROGRESS for the next viewport (legal path RESOLVED -> REOPENED -> IN_PROGRESS).
  await apiTicketStatus(page, L4.shotResolve, 'REOPENED');
  await apiTicketStatus(page, L4.shotResolve, 'IN_PROGRESS');
});

scenario('ticket cancel', E2E_STAFF_A.email, async (page, vp) => {
  await openStaffTicket(page, L4.shotCancel[vp.name]);
  await page.getByLabel('Current Status').selectOption('CANCELLED');
  await expect(page.getByRole('dialog')).toContainText('This also cancels 1 open action.');
  await twCancelDialog(page, vp, false);
  await page.getByRole('button', { name: 'Yes, cancel ticket' }).click();
  await expect(page.getByRole('status')).toHaveText('Status changed to Cancelled.');
  await expect(page.getByText('Cancelled', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await twCancelled(page, vp);
});

// ---------------------------------------------------------------- regression
const rg = 'regression';
const rgLogin = shot(rg, '01', 'login', 'Login screen.');
const rgMyTickets = shot(rg, '02', 'my-tickets', 'My Tickets list (Requester).');
const rgDetail = shot(rg, '03', 'ticket-detail-attachments-comments', 'Requester Ticket Detail with an attachment and Public Comments.');
const rgQueue = shot(rg, '04', 'ticket-queue', 'Ticket Queue (IT Staff).');
const rgNotes = shot(rg, '05', 'internal-notes', 'Staff Ticket Detail with Public Comments and the Internal Notes block.');
const rgUsers = shot(rg, '06', 'user-management', 'User Management list (Administrator).');

test('SHOT-01: regression screens (login)', async ({ page }) => {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.request.post(`${API}/auth/logout`).catch(() => {});
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
    await rgLogin(page, vp);
  }
});

scenario('regression screens (Requester)', E2E_REQUESTER_A.email, async (page, vp) => {
  await page.goto('/tickets');
  await expect(page.locator('tbody tr, .d-md-none .zg-card').filter({ visible: true }).first()).toBeVisible();
  await rgMyTickets(page, vp);
});

scenario('regression screens (Requester detail)', E2E_REQUESTER_L4.email, async (page, vp) => {
  const ticket = L4.awaitingReview;
  const detail = await (await page.request.get(`${API}/tickets/${ticket}`)).json();
  if (!detail.publicComments?.length) {
    await page.request.post(`${API}/tickets/${ticket}/comments`, { data: { content: 'The VPN works again since this morning.' } });
  }
  await page.goto(`/tickets/${ticket}`);
  if (!detail.attachments?.length && vp.name === 'desktop-1280') {
    await page.setInputFiles('input[type="file"]', IMAGE);
  }
  await expect(page.getByText('Attachments (1)')).toBeVisible();
  await expect(page.getByText('The VPN works again since this morning.')).toBeVisible();
  await rgDetail(page, vp);
});

scenario('regression screens (IT Staff)', E2E_STAFF_A.email, async (page, vp) => {
  await page.goto('/staff/tickets');
  await expect(page.getByText(/of \d+ tickets/)).toBeVisible();
  await rgQueue(page, vp);
  await page.goto('/staff/tickets/TKT-E2E-000003');
  await expect(page.getByText('E2E fixture internal note - staff only.')).toBeVisible();
  await rgNotes(page, vp);
});

scenario('regression screens (Administrator)', E2E_ADMIN.email, async (page, vp) => {
  await page.goto('/admin/users');
  await expect(page.getByRole('button', { name: '+ Create User' })).toBeVisible();
  await expect(page.locator('.table-responsive tbody tr, .d-md-none .zg-card').filter({ visible: true }).first()).toBeVisible();
  await rgUsers(page, vp);
});

// ---------------------------------------------------------------- demo (seeded accounts, prisma/seed.ts)
// The README demo accounts on the seeded data, for the report. Password: the README dev password.
const DEMO_PASSWORD = 'DevPass123!';
const DEMO_TICKET = 'Wi-Fi certificate expired on several lab laptops'; // seeded with 3 Actions Taken
const dm = 'demo';
const dmAdmin = shot(dm, '01', 'admin-dashboard', 'Seeded Administrator (admin@example.com) dashboard with User Accounts.');
const dmStaff = shot(dm, '02', 'staff-dashboard', 'Seeded IT Staff (alex.kim@example.com) dashboard.');
const dmRequester = shot(dm, '03', 'requester-dashboard', 'Seeded Requester (jennifer.anderson@toktickit.test) dashboard.');
const dmStaffTicket = shot(dm, '04', 'staff-ticket-actions', 'Seeded ticket with several Actions Taken, as IT Staff (Alex, Ticket Owner).');
const dmRequesterTicket = shot(dm, '05', 'requester-ticket-actions', 'The same seeded ticket as its Requester: read-only "Work done on your ticket".');

function demo(title: string, email: string, body: (page: Page, vp: Viewport) => Promise<void>) {
  test(`SHOT-01: demo - ${title}`, async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, email, DEMO_PASSWORD);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await body(page, vp);
    }
  });
}

demo('Administrator dashboard', 'admin@example.com', async (page, vp) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'User Accounts' })).toBeVisible();
  await dmAdmin(page, vp);
});

demo('IT Staff dashboard and seeded ticket', 'alex.kim@example.com', async (page, vp) => {
  await page.goto('/dashboard');
  await dashboardsLoaded(page, 5);
  await dmStaff(page, vp);
  const { data } = await (await page.request.get(`${API}/staff/tickets?search=${encodeURIComponent(DEMO_TICKET)}`)).json();
  await openStaffTicket(page, data[0].ticketNumber);
  await expect(page.getByRole('heading', { name: 'Actions Taken (3)' })).toBeVisible();
  await dmStaffTicket(page, vp);
});

demo('Requester dashboard and seeded ticket', 'jennifer.anderson@toktickit.test', async (page, vp) => {
  await page.goto('/dashboard');
  await dashboardsLoaded(page, 4);
  await dmRequester(page, vp);
  const { data } = await (await page.request.get(`${API}/tickets?search=${encodeURIComponent(DEMO_TICKET)}`)).json();
  await page.goto(`/tickets/${data[0].ticketNumber}`);
  await expect(page.getByRole('heading', { name: 'Work done on your ticket' })).toBeVisible();
  await dmRequesterTicket(page, vp);
});

test.afterAll(() => {
  const lines = ['# Lab 4 screenshots (SHOT-01)', '',
    'Generated by `e2e/lab-04/screenshots.spec.ts` (`npx playwright test e2e/lab-04/screenshots.spec.ts --workers=1`).',
    'Viewports: desktop-1280 (1280x900), tablet-768 (768x1024), mobile-320 (320x800).',
    'Files ending in `-simulated` show a state produced with `page.route` (loading, empty staff dashboard, failure).', ''];
  for (const group of [...new Set(INDEX.map((s) => s.group))]) {
    lines.push(`## ${group}`, '');
    for (const s of INDEX.filter((x) => x.group === group)) {
      for (const vp of VIEWPORTS) lines.push(`- \`${group}/${s.nn}-${s.state}-${vp.name}${s.simulated ? '-simulated' : ''}.png\` - ${s.what}`);
    }
    lines.push('');
  }
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'INDEX.md'), lines.join('\n'));
});
