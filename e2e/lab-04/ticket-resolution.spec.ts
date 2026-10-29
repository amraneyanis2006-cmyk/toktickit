import { test, expect } from '@playwright/test';
import { login } from '../helpers';
import { E2E_REQUESTER_L4, E2E_STAFF_A, FIXTURE_PASSWORD, L4 } from '../global-setup';
import { addAction, openStaffTicket, viewAction } from './lab4';

test.use({ viewport: { width: 1280, height: 900 } });

test.describe('E2E-04: resolution through the UI', () => {
  test('E2E-04: Resolved is disabled with a reason, enabled once an action is completed; history, badge and Requester view refresh', async ({ page }) => {
    await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
    await openStaffTicket(page, L4.resolution);
    const status = page.getByLabel('Current Status');
    await expect(status.locator('option[value="RESOLVED"]')).toBeDisabled();
    await expect(page.getByText('To resolve, complete at least one action and close all open actions.')).toBeVisible();

    await addAction(page, 'Reset the network adapter');
    await viewAction(page, 'Reset the network adapter');
    await page.getByLabel(/^Result/).fill('Adapter reset, connection stable.');
    await page.getByRole('button', { name: 'Complete' }).click();
    await expect(page.locator('table tbody tr').first()).toContainText('Completed');
    await expect(status.locator('option[value="RESOLVED"]')).toBeEnabled();

    await status.selectOption('RESOLVED');
    await expect(page.getByRole('status')).toHaveText('Status changed to Resolved.');
    await expect(page.locator('.zg-badge-status-resolved').first()).toBeVisible();
    await expect(page.getByText(/^Resolved on /)).toBeVisible();
    await expect(page.getByRole('list', { name: 'Status history' })).toContainText('In progress → Resolved');

    await login(page, E2E_REQUESTER_L4.email, FIXTURE_PASSWORD);
    await page.goto(`/tickets/${L4.resolution}`);
    await expect(page.getByRole('heading', { name: 'Work done on your ticket' })).toBeVisible();
    await expect(page.getByText('Reset the network adapter').filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Status history' })).toContainText('In progress → Resolved');
    await expect(page.getByRole('button', { name: 'Add Action' })).toHaveCount(0);
  });
});

test.describe('E2E-05: Requester says resolved, staff review', () => {
  test('E2E-05: staff see the banner and the Awaiting Review count; the status is unchanged until staff resolve', async ({ page }) => {
    await login(page, E2E_REQUESTER_L4.email, FIXTURE_PASSWORD);
    await page.goto(`/tickets/${L4.requesterResolves}`);
    await page.getByRole('button', { name: 'Problem Appears Resolved' }).click();
    await expect(page.getByRole('button', { name: 'You indicated this is resolved' })).toBeDisabled();

    await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
    await page.getByRole('link', { name: 'View all tickets awaiting review' }).click();
    await expect(page.getByText(L4.requesterResolves).first()).toBeVisible();

    await openStaffTicket(page, L4.requesterResolves);
    await expect(page.getByText('Requester says resolved', { exact: true })).toBeVisible();
    await expect(page.getByText('The requester says the problem appears resolved. Review the actions before resolving.')).toBeVisible();
    await expect(page.locator('.zg-badge-status-in_progress').first()).toBeVisible();

    // Only the staff decision changes the status.
    await addAction(page, 'Confirmed with the Requester');
    await viewAction(page, 'Confirmed with the Requester');
    await page.getByLabel(/^Result/).fill('Requester confirmed it works.');
    await page.getByRole('button', { name: 'Complete' }).click();
    await expect(page.locator('table tbody tr').first()).toContainText('Completed');
    await page.getByLabel('Current Status').selectOption('RESOLVED');
    await expect(page.getByRole('status')).toHaveText('Status changed to Resolved.');
    await expect(page.getByText('The requester says the problem appears resolved. Review the actions before resolving.')).toBeHidden();
  });
});
