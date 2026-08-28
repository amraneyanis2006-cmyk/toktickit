import { test, expect } from '@playwright/test';
import { selectRequester } from '../../helpers';

test.describe('E2E-01: Full responsive ticket creation flow', () => {
  test('creates a ticket end-to-end at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await selectRequester(page);

    await page.getByRole('link', { name: '+ Create Ticket' }).click();
    await page.waitForURL('**/tickets/new');
    await page.waitForSelector('#category');

    await page.selectOption('#category', { index: 1 });
    await page.selectOption('#relatedSystem', { index: 1 });
    await page.selectOption('#priority', { index: 1 });
    await page.fill('#summary', 'E2E-01 full flow ticket summary');
    await page.fill('#description', 'E2E-01 full flow ticket description, long enough to pass validation.');

    await page.getByRole('button', { name: 'Submit Ticket' }).click();
    await page.waitForSelector('text=Ticket created');

    const ticketNumberText = await page.locator('.fs-3.fw-bold').textContent();
    expect(ticketNumberText).toMatch(/TKT-\d{4}-\d+/);

    await page.getByRole('button', { name: 'Create Another' }).click();
    await page.getByRole('link', { name: 'My Tickets' }).click();
    await page.waitForURL('**/tickets');
    await page.waitForSelector('tbody tr');

    // At 1280px only the desktop table is visible; scope to it to avoid
    // matching the hidden mobile card that shares the same DOM.
    await expect(page.locator('tbody').getByText(ticketNumberText!.trim())).toBeVisible();
  });

  test('creates a ticket end-to-end at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await selectRequester(page);

    await page.getByRole('link', { name: '+ Create Ticket' }).click();
    await page.waitForURL('**/tickets/new');
    await page.waitForSelector('#category');

    await page.selectOption('#category', { index: 1 });
    await page.selectOption('#relatedSystem', { index: 1 });
    await page.selectOption('#priority', { index: 1 });
    await page.fill('#summary', 'E2E-01 mobile flow ticket summary');
    await page.fill('#description', 'E2E-01 mobile flow ticket description, long enough to pass validation.');

    await page.getByRole('button', { name: 'Submit Ticket' }).click();
    await page.waitForSelector('text=Ticket created');

    const ticketNumberText = await page.locator('.fs-3.fw-bold').textContent();
    expect(ticketNumberText).toMatch(/TKT-\d{4}-\d+/);
  });
});
