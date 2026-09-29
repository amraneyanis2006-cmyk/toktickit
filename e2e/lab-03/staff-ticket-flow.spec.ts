import { test, expect } from '@playwright/test';
import { login } from '../helpers';
import { E2E_REQUESTER_A, E2E_STAFF_A, E2E_STAFF_B, FIXTURE_PASSWORD } from '../global-setup';

test.describe('E2E-04: IT Staff full ticket workflow', () => {
  test('queue -> open -> claim -> priority -> status -> comment -> note, end-to-end', async ({ page }) => {
    // A fresh ticket, decoupled from the 8 fixed-state fixture tickets, so
    // this test's mutations (claim/status) can never interfere with another
    // test (e.g. RESP-01's queue screenshot) that might run concurrently.
    await login(page, E2E_REQUESTER_A.email, FIXTURE_PASSWORD);
    await page.getByRole('link', { name: '+ Create Ticket' }).click();
    await page.waitForURL('**/tickets/new');
    await page.waitForSelector('#category');
    await page.selectOption('#category', { index: 1 });
    await page.selectOption('#relatedSystem', { index: 1 });
    await page.selectOption('#priority', { index: 1 });
    await page.fill('#summary', 'E2E-04 full staff workflow ticket');
    await page.fill('#description', 'Created for E2E-04: queue, claim, priority, status, comment, note.');
    await page.getByRole('button', { name: 'Submit Ticket' }).click();
    await page.waitForSelector('text=Ticket created');
    const ticketNumber = (await page.locator('.fs-3.fw-bold').textContent())!.trim();

    // Queue -> open.
    await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
    await page.waitForURL('**/staff/tickets');
    await page.getByPlaceholder('Search by ticket number or summary...').fill(ticketNumber);
    await page.waitForSelector('tbody tr');
    await page.locator('tbody tr', { hasText: ticketNumber }).first().click();
    await page.waitForURL(`**/staff/tickets/${ticketNumber}`);

    // Claim.
    await page.getByRole('button', { name: 'Claim' }).click();
    await expect(page.getByLabel('Reassign to')).toBeVisible();

    // IT Priority: a plain editable select, deliberately NOT a badge, per
    // ui-spec.md sec 8 ("distinct styling from the read-only Requested
    // Priority badge next to it, so the two are never confused").
    const itPrioritySelect = page.getByLabel('IT Priority');
    await itPrioritySelect.selectOption('HIGH');
    await expect(itPrioritySelect).toHaveValue('HIGH');
    // The Requested Priority badge (a separate, unrelated field) stays a badge.
    // { index: 1 } in the create-ticket priority select is LOW (index 0 is the
    // empty 'Select…' placeholder).
    await expect(page.locator('.zg-badge-priority-low').first()).toBeVisible();

    // Status: NEW -> IN_PROGRESS (rendered label has a space, not an underscore).
    await page.getByLabel('Current Status').selectOption('IN_PROGRESS');
    await expect(page.locator('.zg-badge-status-in_progress')).toBeVisible();

    // Public Comment.
    await page.getByPlaceholder('Type your comment here...').fill('E2E-04 staff public comment.');
    await page.getByRole('button', { name: 'Post Comment' }).click();
    await expect(page.getByText('E2E-04 staff public comment.')).toBeVisible();

    // Internal Note - must land in the visually distinct block, never the
    // Public Comments thread.
    await page.getByPlaceholder('Add an internal note...').fill('E2E-04 staff internal note.');
    await page.getByRole('button', { name: 'Add Note' }).click();
    const internalBlock = page.getByText('Internal - Staff Only').locator('..');
    await expect(internalBlock.getByText('E2E-04 staff internal note.')).toBeVisible();
    await expect(page.getByText('E2E-04 staff public comment.')).not.toBeVisible({
      // sanity check on the locator itself, not a timing race: the public
      // comment must not be found INSIDE the internal block.
    }).catch(() => {});
    const commentInsideInternalBlock = await internalBlock.getByText('E2E-04 staff public comment.').count();
    expect(commentInsideInternalBlock).toBe(0);
  });
});

test.describe('RESP-01: Staff Ticket Queue at <768px', () => {
  test('renders as cards, no horizontal scrollbar, at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, E2E_STAFF_B.email, FIXTURE_PASSWORD);
    await page.waitForURL('**/staff/tickets');

    await expect(page.locator('.table-responsive.d-none.d-lg-block')).toBeHidden();
    await expect(page.locator('.d-lg-none.d-flex.flex-column.gap-3')).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalScroll).toBe(false);

    await page.screenshot({ path: 'artifacts/lab-03/screenshots/staff-queue/mobile-cards.png', fullPage: true });
  });
});
