import { test, expect } from '@playwright/test';
import { selectRequester } from '../../helpers';

const BREAKPOINTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
];

for (const bp of BREAKPOINTS) {
  test.describe(`Create Ticket screenshot states (${bp.name})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
    });

    test('initial state', async ({ page }) => {
      await selectRequester(page);
      await page.goto('/tickets/new');
      await page.waitForSelector('#category');
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/create-ticket/initial-${bp.name}.png`,
        fullPage: true,
      });
    });

    test('validation-error state', async ({ page }) => {
      await selectRequester(page);
      await page.goto('/tickets/new');
      await page.waitForSelector('#category');
      await page.getByRole('button', { name: 'Submit Ticket' }).click();
      await page.waitForSelector('.zg-field-error');
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/create-ticket/validation-error-${bp.name}.png`,
        fullPage: true,
      });
    });

    test('submitting state', async ({ page }) => {
      await selectRequester(page);
      await page.goto('/tickets/new');
      await page.waitForSelector('#category');

      await page.route('**/api/tickets', async (route) => {
        if (route.request().method() === 'POST') {
          await new Promise((r) => setTimeout(r, 2000));
          await route.continue();
        } else {
          await route.continue();
        }
      });

      await page.selectOption('#category', { index: 1 });
      await page.selectOption('#relatedSystem', { index: 1 });
      await page.selectOption('#priority', { index: 1 });
      await page.fill('#summary', 'Screenshot test summary');
      await page.fill('#description', 'Screenshot test description, long enough.');
      await page.getByRole('button', { name: 'Submit Ticket' }).click();
      await page.waitForSelector('text=Submitting…');
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/create-ticket/submitting-${bp.name}.png`,
        fullPage: true,
      });
    });

    test('success state', async ({ page }) => {
      await selectRequester(page);
      await page.goto('/tickets/new');
      await page.waitForSelector('#category');

      await page.selectOption('#category', { index: 1 });
      await page.selectOption('#relatedSystem', { index: 1 });
      await page.selectOption('#priority', { index: 1 });
      await page.fill('#summary', 'Screenshot test summary');
      await page.fill('#description', 'Screenshot test description, long enough.');
      await page.getByRole('button', { name: 'Submit Ticket' }).click();
      await page.waitForSelector('text=Ticket created');
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/create-ticket/success-${bp.name}.png`,
        fullPage: true,
      });
    });

    test('api-failure state', async ({ page }) => {
      await selectRequester(page);
      await page.goto('/tickets/new');
      await page.waitForSelector('#category');

      await page.route('**/api/tickets', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'INTERNAL_ERROR', message: 'Simulated failure for screenshot.' }),
          });
        } else {
          await route.continue();
        }
      });

      await page.selectOption('#category', { index: 1 });
      await page.selectOption('#relatedSystem', { index: 1 });
      await page.selectOption('#priority', { index: 1 });
      await page.fill('#summary', 'Screenshot test summary');
      await page.fill('#description', 'Screenshot test description, long enough.');
      await page.getByRole('button', { name: 'Submit Ticket' }).click();
      await page.waitForSelector('text=Unable to submit ticket');
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/create-ticket/api-failure-${bp.name}.png`,
        fullPage: true,
      });
    });

    test('invalid-attachment state', async ({ page }) => {
      await selectRequester(page);
      await page.goto('/tickets/new');
      await page.waitForSelector('#category');

      await page.setInputFiles('input[type="file"]', {
        name: 'not-allowed.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('not an allowed file type'),
      });
      await page.waitForSelector('.zg-field-error');
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/create-ticket/invalid-attachment-${bp.name}.png`,
        fullPage: true,
      });
    });
  });
}
