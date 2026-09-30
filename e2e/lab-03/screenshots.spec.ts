import { test, expect } from '@playwright/test';
import { login } from '../helpers';
import { E2E_REQUESTER_A, E2E_STAFF_A, E2E_ADMIN, FIXTURE_PASSWORD } from '../global-setup';

const WIDTHS: Array<{ name: string; width: number; height: number }> = [
  { name: 'mobile-320', width: 320, height: 800 },
  { name: 'tablet-768', width: 768, height: 900 },
  { name: 'desktop-1280', width: 1280, height: 900 },
];

// ui-spec.md sec 12 screenshot checklist. Behavior is already proven by
// E2E-01..06 and the other lab-03 specs; this file exists purely to produce
// the required evidence images at all 3 widths for every remaining checklist
// item, per "For each of the following, capture desktop, tablet, and mobile."

test.describe('Checklist: Authenticated shell per role', () => {
  const CASES = [
    { role: 'requester', email: E2E_REQUESTER_A.email, url: '/tickets' },
    { role: 'it-staff', email: E2E_STAFF_A.email, url: '/staff/tickets' },
    { role: 'administrator', email: E2E_ADMIN.email, url: '/admin/users' },
  ];
  for (const c of CASES) {
    for (const bp of WIDTHS) {
      test(`${c.role} shell at ${bp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: bp.width, height: bp.height });
        await login(page, c.email, FIXTURE_PASSWORD);
        await page.waitForURL(`**${c.url}`);
        await page.screenshot({ path: `artifacts/lab-03/screenshots/shell/${c.role}-${bp.name}.png`, fullPage: true });
      });
    }
  }
});

test.describe('Checklist: Requester Ticket Detail with Public Comments + resolved indication', () => {
  for (const bp of WIDTHS) {
    test(`at ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await login(page, E2E_REQUESTER_A.email, FIXTURE_PASSWORD);
      // TKT-E2E-000003 (IN_PROGRESS) already carries the fixture Public Comments.
      await page.goto('/tickets/TKT-E2E-000003');
      await expect(page.getByText('E2E fixture public comment from the Requester.')).toBeVisible();
      await page.screenshot({ path: `artifacts/lab-03/screenshots/requester-ticket-detail/${bp.name}.png`, fullPage: true });
    });
  }
});

test.describe('Checklist: IT Staff Ticket Queue states', () => {
  for (const bp of WIDTHS) {
    test(`populated at ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
      await page.waitForURL('**/staff/tickets');
      await page.screenshot({ path: `artifacts/lab-03/screenshots/staff-queue/${bp.name}-populated.png`, fullPage: true });
    });

    test(`filtered at ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
      await page.waitForURL('**/staff/tickets');
      await page.getByPlaceholder('Search by ticket number or summary...').fill('TKT-E2E');
      await page.waitForSelector('tbody tr:visible, .zg-card.p-3:visible');
      await page.screenshot({ path: `artifacts/lab-03/screenshots/staff-queue/${bp.name}-filtered.png`, fullPage: true });
    });

    test(`no-results at ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
      await page.waitForURL('**/staff/tickets');
      await page.getByPlaceholder('Search by ticket number or summary...').fill('zzz-no-such-ticket-zzz');
      await page.waitForSelector('text=No tickets match your filters.');
      await page.screenshot({ path: `artifacts/lab-03/screenshots/staff-queue/${bp.name}-no-results.png`, fullPage: true });
    });
  }

  // NOT captured: the "empty" state (zero tickets in the entire system, no
  // filters) is structurally unreachable on this development database, which
  // already holds hundreds of real/seeded tickets - the same kind of
  // unreachable edge case as "deactivate the last Administrator" found
  // earlier in this pass. Faking it would mean deleting real data.
});

test.describe('Checklist: IT Staff Ticket Detail (Claim, IT Priority, Status, Comments vs Notes)', () => {
  for (const bp of WIDTHS) {
    test(`at ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
      // TKT-E2E-000003 already carries a Public Comment AND an Internal Note,
      // is claimed (owned by staffA), IN_PROGRESS - showing every element
      // this checklist item asks for in one screen.
      await page.goto('/staff/tickets/TKT-E2E-000003');
      await expect(page.getByText('Internal - Staff Only')).toBeVisible();
      await page.screenshot({ path: `artifacts/lab-03/screenshots/staff-ticket-detail/${bp.name}.png`, fullPage: true });
    });
  }
});

test.describe('Checklist: Administrator User Management list (search, role filter)', () => {
  for (const bp of WIDTHS) {
    test(`at ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await login(page, E2E_ADMIN.email, FIXTURE_PASSWORD);
      await page.waitForURL('**/admin/users');
      await page.getByPlaceholder('Search by name or email...').fill('e2e');
      await page.getByLabel('Filter by role').selectOption('IT_STAFF');
      await page.waitForSelector('tbody tr:visible, .zg-card.p-3:visible');
      await page.screenshot({ path: `artifacts/lab-03/screenshots/admin-users/${bp.name}-list-filtered.png`, fullPage: true });
    });
  }
});

test.describe('Checklist: Administrator Create User panel', () => {
  for (const bp of WIDTHS) {
    test(`at ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await login(page, E2E_ADMIN.email, FIXTURE_PASSWORD);
      await page.waitForURL('**/admin/users');
      await page.getByRole('button', { name: '+ Create User' }).click();
      await page.getByRole('dialog').waitFor({ state: 'visible' });
      await page.screenshot({ path: `artifacts/lab-03/screenshots/admin-users/${bp.name}-create-panel.png`, fullPage: true });
    });
  }
});

test.describe('Checklist: Administrator Edit User panel, self-deactivation disabled state', () => {
  for (const bp of WIDTHS) {
    test(`at ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await login(page, E2E_ADMIN.email, FIXTURE_PASSWORD);
      await page.waitForURL('**/admin/users');
      await page.getByRole('button', { name: `Edit ${E2E_ADMIN.name}` }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('switch', { name: 'Active' })).toBeDisabled();
      await page.screenshot({ path: `artifacts/lab-03/screenshots/admin-users/${bp.name}-edit-self-disabled.png`, fullPage: true });
    });
  }
  // NOT captured: the "last active Administrator" disabled state is
  // unreachable from the UI, as established in the #19 PR review - only an
  // Administrator can view this panel, and the only Administrator who could
  // ever BE the last one editing their own row is redirected to the
  // self-deactivation lock first (both locks fire together on one's own
  // row; they are not visually distinguishable states).
});

test.describe('Checklist: Forbidden-access redirects', () => {
  for (const bp of WIDTHS) {
    test(`non-Administrator hitting /admin/users at ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
      await page.goto('/admin/users');
      await page.waitForURL('**/staff/tickets');
      await page.screenshot({ path: `artifacts/lab-03/screenshots/forbidden/${bp.name}-non-admin-to-admin-users.png`, fullPage: true });
    });

    test(`non-staff hitting /staff/tickets at ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await login(page, E2E_REQUESTER_A.email, FIXTURE_PASSWORD);
      await page.goto('/staff/tickets');
      await page.waitForURL('**/tickets');
      await page.screenshot({ path: `artifacts/lab-03/screenshots/forbidden/${bp.name}-non-staff-to-staff-tickets.png`, fullPage: true });
    });
  }
});
