import { test, expect } from '@playwright/test';
import { selectRequester } from '../../helpers';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '../fixtures/test-image.png');

test.describe('Ticket Detail screenshot states (desktop)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('loaded state', async ({ page }) => {
    await selectRequester(page, 'Jennifer Anderson');
    await page.waitForSelector('tbody tr');
    await page.locator('tbody tr').first().click();
    await page.waitForURL('**/tickets/TKT-*');
    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/ticket-detail/loaded.png',
      fullPage: true,
    });
  });

  test('attachment-added state', async ({ page }) => {
    await selectRequester(page, 'Jennifer Anderson');
    await page.waitForSelector('tbody tr');
    await page.locator('tbody tr').first().click();
    await page.waitForURL('**/tickets/TKT-*');

    const filePath = path.join(__dirname, '../fixtures/test-image.png');
    const activeCount = await page.locator('.zg-badge-status-open').count();
    if (activeCount === 0) {
      await page.setInputFiles('input[type="file"]', filePath);
      await page.waitForSelector('.zg-badge-status-open');
    }
    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/ticket-detail/attachment-added.png',
      fullPage: true,
    });
  });

  test('attachment-removed state', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept('Screenshot test removal reason.'));

    await selectRequester(page, 'Jennifer Anderson');
    await page.waitForSelector('tbody tr');
    await page.locator('tbody tr').first().click();
    await page.waitForURL('**/tickets/TKT-*');

    const filePath = path.join(__dirname, '../fixtures/test-image.png');
    const activeCount = await page.locator('.zg-badge-status-open').count();
    if (activeCount === 0) {
      await page.setInputFiles('input[type="file"]', filePath);
      await page.waitForSelector('.zg-badge-status-open');
    }

    await page.getByRole('button', { name: 'Remove' }).first().click();
    await page.waitForSelector('.zg-badge-status-resolved');
    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/ticket-detail/attachment-removed.png',
      fullPage: true,
    });
  });
});

test.describe('Ticket Detail screenshot states (mobile)', () => {
  test('mobile state', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await selectRequester(page, 'Jennifer Anderson');
    await page.waitForSelector('.d-md-none .zg-card.p-3');
    await page.locator('.d-md-none .zg-card.p-3').first().click();
    await page.waitForURL('**/tickets/TKT-*');
    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/ticket-detail/mobile.png',
      fullPage: true,
    });
  });
});
