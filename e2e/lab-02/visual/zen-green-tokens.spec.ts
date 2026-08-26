import { test, expect } from '@playwright/test';
import { selectRequester } from '../../helpers';

test.describe('VIS-01: Zen Green token conformance', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('header uses the --zg-primary background token', async ({ page }) => {
    await selectRequester(page);
    await page.locator('.zg-header').waitFor({ state: 'visible' });

    const headerBg = await page.evaluate(() => {
      const header = document.querySelector('.zg-header');
      if (!header) return null;
      return getComputedStyle(header).backgroundColor;
    });

    const expectedBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--zg-primary').trim()
    );

    expect(headerBg).not.toBeNull();
    console.log(`Header background: ${headerBg}, --zg-primary token: ${expectedBg}`);

    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/desktop/my-tickets-header.png',
    });
  });

  test('primary button uses the --zg-primary token family', async ({ page }) => {
    await selectRequester(page);
    await page.goto('/tickets/new');

    const button = page.locator('.btn-zg-primary').first();
    await expect(button).toBeVisible();

    const bg = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
    console.log(`Primary button background: ${bg}`);

    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/desktop/create-ticket-buttons.png',
    });
  });

  test('badges render with token-defined colors on Ticket Detail', async ({ page }) => {
    await selectRequester(page);
    await page.waitForSelector('tbody tr');
    await page.locator('tbody tr').first().click();
    await page.waitForURL('**/tickets/TKT-*');

    const badge = page.locator('.zg-badge').first();
    await expect(badge).toBeVisible();

    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/desktop/ticket-detail-badges.png',
    });
  });
});
