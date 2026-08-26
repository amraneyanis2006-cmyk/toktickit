import { test, expect } from '@playwright/test';
import { selectRequester } from '../../helpers';

test.describe('RESP-01: My Tickets responsive at mobile width', () => {
  test('renders as stacked cards, no horizontal scrollbar at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await selectRequester(page);

    // The desktop table must be hidden, and the mobile card layout visible.
    await expect(page.locator('.table-responsive.d-none.d-md-block')).toBeHidden();
    await expect(page.locator('.d-md-none.d-flex.flex-column.gap-3')).toBeVisible();

    // No horizontal scrollbar: document's scrollWidth must not exceed the viewport width.
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalScroll).toBe(false);

    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/mobile/my-tickets.png',
      fullPage: true,
    });
  });
});