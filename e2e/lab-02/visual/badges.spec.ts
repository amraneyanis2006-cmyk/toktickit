import { test, expect } from '@playwright/test';
import { login } from '../../helpers';
import { E2E_REQUESTER_A, FIXTURE_PASSWORD } from '../../global-setup';

test.describe('VIS-02: Badge consistency across screens', () => {
  test('Priority and Status badges render identically in My Tickets and Ticket Detail', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, E2E_REQUESTER_A.email, FIXTURE_PASSWORD);

    await page.waitForSelector('tbody tr');
    const firstRow = page.locator('tbody tr').first();

    const listPriorityClass = await firstRow
      .locator('[class*="zg-badge-priority-"]')
      .first()
      .getAttribute('class');
    const listStatusClass = await firstRow
      .locator('[class*="zg-badge-status-"]')
      .first()
      .getAttribute('class');

    await firstRow.click();
    await page.waitForURL('**/tickets/TKT-*');

    const detailPriorityClass = await page
      .locator('[class*="zg-badge-priority-"]')
      .first()
      .getAttribute('class');
    const detailStatusClass = await page
      .locator('[class*="zg-badge-status-"]')
      .first()
      .getAttribute('class');

    expect(detailPriorityClass).toBe(listPriorityClass);
    expect(detailStatusClass).toBe(listStatusClass);

    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/desktop/badges-comparison.png',
      fullPage: true,
    });
  });
});
