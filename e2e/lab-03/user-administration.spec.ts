import { test, expect } from '@playwright/test';
import { login } from '../helpers';
import { E2E_ADMIN, E2E_STAFF_A, FIXTURE_PASSWORD } from '../global-setup';

test.describe('E2E-05: Administrator full user lifecycle', () => {
  test('create -> search/find -> edit -> reset password -> deactivate (non-self, non-last-admin)', async ({ page }) => {
    const email = `e2e-lifecycle-${Date.now()}@example.com`;

    await login(page, E2E_ADMIN.email, FIXTURE_PASSWORD);
    await page.waitForURL('**/admin/users');

    // Create.
    await page.getByRole('button', { name: '+ Create User' }).click();
    const createDialog = page.getByRole('dialog');
    await createDialog.getByLabel('Full Name').fill('E2E Lifecycle User');
    await createDialog.getByLabel('Email Address').fill(email);
    await createDialog.getByLabel('Role', { exact: false }).selectOption('IT_STAFF');
    await createDialog.getByRole('button', { name: 'Create User' }).click();
    await expect(page.getByText(/initial password.*shown once/i)).toBeVisible();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Search / find.
    await page.getByPlaceholder('Search by name or email...').fill(email);
    await page.waitForSelector('tbody tr');
    await expect(page.locator('tbody').getByText(email)).toBeVisible();

    // Edit.
    await page.getByRole('button', { name: `Edit E2E Lifecycle User` }).first().click();
    const editDialog = page.getByRole('dialog');
    const nameField = editDialog.getByLabel('Full Name');
    await nameField.fill('E2E Lifecycle User (Renamed)');
    await editDialog.getByRole('button', { name: 'Save User' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText(/user updated/i)).toBeVisible();

    // Reset password.
    await page.getByPlaceholder('Search by name or email...').fill(email);
    await page.waitForSelector('tbody tr');
    await page.getByRole('button', { name: 'Edit E2E Lifecycle User (Renamed)' }).first().click();
    const resetDialog = page.getByRole('dialog');
    await resetDialog.getByRole('button', { name: 'Set New Initial Password' }).click();
    await resetDialog.getByRole('button', { name: 'Yes, issue new password' }).click();
    await expect(page.getByText(/initial password.*shown once/i)).toBeVisible();

    // Deactivate (not self, not the last admin).
    await page.getByPlaceholder('Search by name or email...').fill(email);
    await page.waitForSelector('tbody tr');
    await page.getByRole('button', { name: 'Edit E2E Lifecycle User (Renamed)' }).first().click();
    const deactivateDialog = page.getByRole('dialog');
    await deactivateDialog.getByRole('switch', { name: 'Active' }).click();
    await deactivateDialog.getByRole('button', { name: 'Save User' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    await page.getByPlaceholder('Search by name or email...').fill(email);
    await page.waitForSelector('tbody tr');
    await expect(page.locator('tbody tr', { hasText: email }).getByText('Inactive')).toBeVisible();
  });
});

test.describe('E2E-06: Admin safety-rule UI', () => {
  test('self-deactivation and own-role controls are disabled in the running UI, with the reason shown', async ({ page }) => {
    await login(page, E2E_ADMIN.email, FIXTURE_PASSWORD);
    await page.waitForURL('**/admin/users');

    await page.getByRole('button', { name: `Edit ${E2E_ADMIN.name}` }).first().click();
    const dialog = page.getByRole('dialog');

    await expect(dialog.getByLabel('Role', { exact: false })).toBeDisabled();
    await expect(dialog.getByRole('switch', { name: 'Active' })).toBeDisabled();
    await expect(dialog.getByText(/cannot change your own role or deactivate your own account/i)).toBeVisible();
  });

  test('editing a DIFFERENT user leaves Role and Active enabled', async ({ page }) => {
    await login(page, E2E_ADMIN.email, FIXTURE_PASSWORD);
    await page.waitForURL('**/admin/users');

    await page.getByPlaceholder('Search by name or email...').fill(E2E_STAFF_A.email);
    await page.waitForSelector('tbody tr');
    await page.getByRole('button', { name: `Edit ${E2E_STAFF_A.name}` }).first().click();
    const dialog = page.getByRole('dialog');

    await expect(dialog.getByLabel('Role', { exact: false })).toBeEnabled();
    await expect(dialog.getByRole('switch', { name: 'Active' })).toBeEnabled();
  });
});

test.describe('AC-18, RESP-02: Administrator User Management at <768px', () => {
  test('renders as cards with a full-screen create/edit sheet, no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, E2E_ADMIN.email, FIXTURE_PASSWORD);
    await page.waitForURL('**/admin/users');

    await expect(page.locator('.table-responsive.d-none.d-md-block')).toBeHidden();
    await expect(page.locator('.d-md-none.d-flex.flex-column.gap-3')).toBeVisible();

    let hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalScroll).toBe(false);
    await page.screenshot({ path: 'artifacts/lab-03/screenshots/admin-users/mobile-cards.png', fullPage: true });

    await page.getByRole('button', { name: '+ Create User' }).click();
    const dialog = page.getByRole('dialog');
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    // Full-screen sheet: fills (approximately) the whole viewport, not a
    // small centered modal like the desktop dialog.
    expect(box!.width).toBeGreaterThan(350);

    hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalScroll).toBe(false);
    await page.screenshot({ path: 'artifacts/lab-03/screenshots/admin-users/mobile-create-sheet.png', fullPage: true });
  });
});
