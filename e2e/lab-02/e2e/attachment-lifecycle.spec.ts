import { test, expect } from '@playwright/test';
import { selectRequester } from '../../helpers';
import path from 'path';

test.describe('E2E-03: Attachment lifecycle (add, download, remove)', () => {
  test('a fresh ticket goes through add -> download -> remove', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept('E2E-03 removal reason.'));

    await page.setViewportSize({ width: 1280, height: 900 });
    await selectRequester(page, 'Jennifer Anderson');

    // Create a fresh ticket so this test doesn't depend on any
    // pre-existing attachment state.
    await page.getByRole('link', { name: '+ Create Ticket' }).click();
    await page.waitForURL('**/tickets/new');
    await page.waitForSelector('#category');
    await page.selectOption('#category', { index: 1 });
    await page.selectOption('#relatedSystem', { index: 1 });
    await page.selectOption('#priority', { index: 1 });
    await page.fill('#summary', 'E2E-03 attachment lifecycle ticket');
    await page.fill('#description', 'Ticket created fresh for the attachment lifecycle E2E test.');
    await page.getByRole('button', { name: 'Submit Ticket' }).click();
    await page.waitForSelector('text=Ticket created');
    const ticketNumberText = (await page.locator('.fs-3.fw-bold').textContent())!.trim();

    // Navigate to its detail page.
    await page.goto(`/tickets/${ticketNumberText}`);
    await expect(page.getByText('Attachments (0)')).toBeVisible();

    // 1. Add: upload a file.
    const filePath = path.join(process.cwd(), 'e2e/lab-02/fixtures/test-image.png');
    await page.setInputFiles('input[type="file"]', filePath);
    await page.waitForSelector('.zg-badge-status-open');
    await expect(page.getByText('Attachments (1)')).toBeVisible();

    // 2. Download: verify the download actually starts and produces bytes.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download' }).first().click(),
    ]);
    expect(download.suggestedFilename()).toBe('test-image.png');
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();

    // 3. Remove: soft-remove the attachment and confirm the badge updates.
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await page.waitForSelector('.zg-badge-status-resolved');
    await expect(page.locator('.zg-badge-status-open')).toHaveCount(0);

    // Removed attachments no longer offer a Download button (BR-21).
    await expect(page.getByRole('button', { name: 'Download' })).toHaveCount(0);
  });
});
