import { test, expect } from '@playwright/test';
import { selectRequester } from '../../helpers';

test.describe('My Tickets screenshot states (desktop)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('loaded state', async ({ page }) => {
    // Requester with tickets (per manual verification, ID 1 has 16).
    await selectRequester(page, 'Jennifer Anderson');
    await page.waitForSelector('tbody tr');
    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/my-tickets/loaded.png',
      fullPage: true,
    });
  });

  test('empty state (Requester with zero tickets ever)', async ({ page }) => {
    // Requester with 0 tickets (per manual verification, ID 2).
    await selectRequester(page, 'Michael Brown');
    await page.waitForSelector('text=You haven\'t created any tickets yet.');
    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/my-tickets/empty.png',
      fullPage: true,
    });
  });

  test('no-results state (filters match nothing)', async ({ page }) => {
    await selectRequester(page, 'Jennifer Anderson');
    await page.waitForSelector('tbody tr');
    await page.fill('input[type="search"]', 'zzz-no-such-ticket-zzz');
    await page.waitForSelector('text=No tickets match your filters.');
    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/my-tickets/no-results.png',
      fullPage: true,
    });
  });

  test('filtered state (filter matches a subset)', async ({ page }) => {
    await selectRequester(page, 'Jennifer Anderson');
    await page.waitForSelector('tbody tr');
    // Select the priority filter (2nd select) and pick a real option.
    const selects = page.locator('select.form-select');
    await selects.nth(1).selectOption({ label: 'HIGH' });
    await page.waitForSelector('text=Clear Filters');
    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/my-tickets/filtered.png',
      fullPage: true,
    });
  });
});

test.describe('My Tickets screenshot states (mobile)', () => {
  test('mobile-cards state', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await selectRequester(page, 'Jennifer Anderson');
    await page.waitForSelector('.d-md-none .zg-card.p-3');
    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/my-tickets/mobile-cards.png',
      fullPage: true,
    });
  });
});
