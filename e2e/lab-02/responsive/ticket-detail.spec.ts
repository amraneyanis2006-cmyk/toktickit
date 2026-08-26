import { test, expect } from '@playwright/test';
import { selectRequester } from '../../helpers';
import path from 'path';

test.describe('RESP-03: Ticket Detail responsive at 375px', () => {
  test('attachment rows stay usable, action buttons are tappable (>=44px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await selectRequester(page);

    const firstCard = page.locator('.d-md-none .zg-card.p-3').first();
    await firstCard.waitFor({ state: 'visible' });
    await firstCard.click();
    await page.waitForURL('**/tickets/TKT-*');

    const activeCount = await page.locator('.zg-badge-status-open').count();
    if (activeCount === 0) {
      const filePath = path.join(process.cwd(), 'e2e/lab-02/fixtures/test-image.png');
      await page.setInputFiles('input[type="file"]', filePath);
      await page.waitForSelector('.zg-badge-status-open');
    }

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalScroll).toBe(false);

    const downloadButton = page.getByRole('button', { name: 'Download' }).first();
    await expect(downloadButton).toBeVisible();
    const box = await downloadButton.boundingBox();

    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/mobile/ticket-detail.png',
      fullPage: true,
    });

    expect(box).not.toBeNull();
    // WCAG 2.5.5 minimum tap target size
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
