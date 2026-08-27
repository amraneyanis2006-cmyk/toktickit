import { test, expect } from '@playwright/test';
import { selectRequester } from '../../helpers';

test.describe('E2E-02: Cross-Requester isolation', () => {
  test('a ticket created by one Requester is invisible to another', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    // Create a ticket as Requester A.
    await selectRequester(page, 'Jennifer Anderson');
    await page.getByRole('link', { name: '+ Create Ticket' }).click();
    await page.waitForURL('**/tickets/new');
    await page.waitForSelector('#category');

    await page.selectOption('#category', { index: 1 });
    await page.selectOption('#relatedSystem', { index: 1 });
    await page.selectOption('#priority', { index: 1 });
    await page.fill('#summary', 'E2E-02 isolation test ticket');
    await page.fill('#description', 'This ticket must never be visible to another Requester.');
    await page.getByRole('button', { name: 'Submit Ticket' }).click();
    await page.waitForSelector('text=Ticket created');

    const ticketNumberText = (await page.locator('.fs-3.fw-bold').textContent())!.trim();
    expect(ticketNumberText).toMatch(/TKT-\d{4}-\d+/);

    // Switch to Requester B (a different dev requester).
    await selectRequester(page, 'Michael Brown');

    // 1. Not visible in Requester B's My Tickets list.
    await page.waitForSelector('h1:has-text("My Tickets")');
    const listHasTicket = await page.getByText(ticketNumberText).count();
    expect(listHasTicket).toBe(0);

    // 2. Not accessible directly by URL — Ticket Detail must show the
    //    generic not-found state (BR-27), not the real ticket data.
    await page.goto(`/tickets/${ticketNumberText}`);
    await page.waitForSelector('text=doesn\'t exist or isn\'t yours');
    await expect(page.getByText('E2E-02 isolation test ticket')).toHaveCount(0);
  });
});
