import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { login } from '../helpers';
import { E2E_ADMIN, E2E_REQUESTER_L4, E2E_STAFF_B, FIXTURE_PASSWORD } from '../global-setup';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const image = path.join(__dirname, '../lab-02/fixtures/test-image.png');

test.use({ viewport: { width: 1280, height: 900 } });

test.describe('E2E-08: final regression across roles', () => {
  test('E2E-08: login/logout, My Tickets search, Create Ticket, attachment add/remove, Public Comment, Queue, Claim, Internal Note, User Management search', async ({ page }) => {
    page.on('dialog', (d) => d.accept('E2E-08 removal reason.'));
    const summary = `E2E-08 regression ${Date.now()}`;

    // Requester: create, search, attachment add/remove, Public Comment.
    await login(page, E2E_REQUESTER_L4.email, FIXTURE_PASSWORD);
    await page.getByRole('link', { name: 'Create Ticket', exact: true }).click();
    await page.waitForSelector('#category');
    await page.selectOption('#category', { index: 1 });
    await page.selectOption('#relatedSystem', { index: 1 });
    await page.selectOption('#priority', { index: 1 });
    await page.fill('#summary', summary);
    await page.fill('#description', 'Created by the Lab 4 final regression test.');
    await page.getByRole('button', { name: 'Submit Ticket' }).click();
    await page.waitForSelector('text=Ticket created');
    const ticketNumber = (await page.locator('.fs-3.fw-bold').textContent())!.trim();

    await page.goto('/tickets');
    await page.fill('input[type="search"]', summary);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText(ticketNumber);

    await page.goto(`/tickets/${ticketNumber}`);
    await page.setInputFiles('input[type="file"]', image);
    await expect(page.getByText('Attachments (1)')).toBeVisible();
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await expect(page.getByRole('button', { name: 'Download' })).toHaveCount(0);
    await page.getByPlaceholder('Type your comment here...').fill('E2E-08 requester comment.');
    await page.getByRole('button', { name: 'Post Comment' }).click();
    await expect(page.getByText('E2E-08 requester comment.')).toBeVisible();

    // Logout blocks the app again.
    await page.getByRole('button', { name: /E2E Requester L4/ }).click();
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL('**/login');
    await page.goto('/tickets');
    await expect(page).toHaveURL(/\/login$/);

    // IT Staff: Queue, Claim, Internal Note.
    await login(page, E2E_STAFF_B.email, FIXTURE_PASSWORD);
    await page.getByRole('link', { name: /Ticket Queue/ }).click();
    await page.getByPlaceholder('Search by ticket number or summary...').fill(ticketNumber);
    await page.locator('tbody tr', { hasText: ticketNumber }).first().click();
    await page.waitForURL(`**/staff/tickets/${ticketNumber}`);
    await page.getByRole('button', { name: 'Claim' }).click();
    await expect(page.getByLabel('Reassign to')).toBeVisible();
    await page.getByPlaceholder('Add an internal note...').fill('E2E-08 internal note.');
    await page.getByRole('button', { name: 'Add Note' }).click();
    await expect(page.getByText('Internal - Staff Only').locator('..').getByText('E2E-08 internal note.')).toBeVisible();

    // Administrator: User Management search.
    await login(page, E2E_ADMIN.email, FIXTURE_PASSWORD);
    await page.getByRole('link', { name: /Users/ }).click();
    await page.getByLabel('Search users').fill(E2E_STAFF_B.email);
    await expect(page.locator('.table-responsive tbody tr')).toHaveCount(1);
    await expect(page.locator('.table-responsive tbody tr')).toContainText(E2E_STAFF_B.name);
  });
});
