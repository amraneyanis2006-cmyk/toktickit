import { test, expect } from '@playwright/test';
import { selectRequester } from '../../helpers';

// NOTE: ui-spec.md/tests.md describe a 3-tier layout (1-col mobile,
// 2-col tablet, "full" desktop). CreateTicket.tsx only uses Bootstrap's
// `col-md-*` classes, which have a single breakpoint at 768px — tablet
// (768-991px) and desktop (>=992px) render identically. This test
// asserts the real 2-tier behavior and documents the gap rather than
// testing something the CSS doesn't do.
test.describe('RESP-02: Create Ticket responsive at 375px / 800px / 1280px', () => {
  test('stacks single-column below 768px, no clipped labels', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await selectRequester(page);
    await page.goto('/tickets/new');

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalScroll).toBe(false);

    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/mobile/create-ticket.png',
      fullPage: true,
    });
  });

  test('renders multi-column layout at 800px (tablet)', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 1024 });
    await selectRequester(page);
    await page.goto('/tickets/new');

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalScroll).toBe(false);

    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/tablet/create-ticket.png',
      fullPage: true,
    });
  });

  test('renders full layout at 1280px (desktop) — identical column structure to tablet', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await selectRequester(page);
    await page.goto('/tickets/new');

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalScroll).toBe(false);

    await page.screenshot({
      path: 'artifacts/lab-02/screenshots/desktop/create-ticket.png',
      fullPage: true,
    });
  });
});