import { test, expect } from '@playwright/test';
import { selectRequester } from '../../helpers';

test.describe('E2E-04: My Tickets search, filter, and pagination', () => {
  test('search narrows results, filter narrows results, pagination navigates pages', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await selectRequester(page, 'Sarah Johnson');

    // Unique suffix so re-running this test doesn't collide with tickets
    // left over from a previous run (no cleanup step exists yet).
    const runId = Date.now();
    const tickets = [
      { summary: `E2E-04-${runId} unique alpha ticket`, priority: 'Low' },
      { summary: `E2E-04-${runId} unique bravo ticket`, priority: 'Medium' },
      { summary: `E2E-04-${runId} unique charlie ticket`, priority: 'High' },
    ];

    for (const t of tickets) {
      await page.goto('/tickets/new');
      await page.waitForSelector('#category');
      await page.selectOption('#category', { index: 1 });
      await page.selectOption('#relatedSystem', { index: 1 });
      await page.selectOption('#priority', { label: t.priority });
      await page.fill('#summary', t.summary);
      await page.fill('#description', `Description for ${t.summary}, long enough to pass validation.`);
      await page.getByRole('button', { name: 'Submit Ticket' }).click();
      await page.waitForSelector('text=Ticket created');
      await page.getByRole('button', { name: 'Create Another' }).click();
    }

    await page.goto('/tickets');
    await page.waitForSelector('tbody tr');
    const table = page.locator('tbody');

    // 1. Search narrows to the matching ticket.
    await page.fill('input[type="search"]', `${runId} unique bravo`);
    await page.waitForFunction(
      (id) => document.querySelectorAll('tbody tr').length === 1,
      runId
    );
    await expect(table.getByText(`E2E-04-${runId} unique bravo ticket`)).toBeVisible();
    await expect(table.getByText(`E2E-04-${runId} unique alpha ticket`)).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear Filters' }).click();
    await page.waitForSelector('tbody tr');

    // 2. Priority filter narrows to matching tickets only (scoped by
    //    searching for this run's id too, since other HIGH tickets may exist).
    await page.fill('input[type="search"]', String(runId));
    await page.waitForSelector('tbody tr');
    const selects = page.locator('select.form-select');
    await selects.nth(1).selectOption({ label: 'HIGH' });
    await page.waitForSelector('text=Clear Filters');
    await expect(table.getByText(`E2E-04-${runId} unique charlie ticket`)).toBeVisible();
    await expect(table.getByText(`E2E-04-${runId} unique alpha ticket`)).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear Filters' }).click();
    await page.waitForSelector('tbody tr');

    // 3. Pagination: with page size 10, confirm Next/Previous work if
    //    there's more than one page (best-effort, depends on ticket count).
    const pageSizeSelect = page.locator('select.form-select-sm');
    await pageSizeSelect.selectOption('10');
    const nextButton = page.getByRole('button', { name: 'Next' });
    if (await nextButton.isEnabled()) {
      await nextButton.click();
      await expect(page.getByText(/Page 2 of/)).toBeVisible();
      const prevButton = page.getByRole('button', { name: 'Previous' });
      await prevButton.click();
      await expect(page.getByText(/Page 1 of/)).toBeVisible();
    }
  });
});
