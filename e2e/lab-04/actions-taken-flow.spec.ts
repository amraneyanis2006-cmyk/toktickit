import { test, expect } from '@playwright/test';
import { login } from '../helpers';
import { E2E_STAFF_A, E2E_STAFF_LEAVING, FIXTURE_PASSWORD, L4 } from '../global-setup';
import { VIEWPORTS, addAction, apiActions, hasVisibleFocus, noHorizontalScroll, openStaffTicket, setUserActive, tabTo, viewAction } from './lab4';

test.use({ viewport: { width: 1280, height: 900 } });

test.describe('E2E-02: inactive assignee', () => {
  test('E2E-02: assigning an action to a staff member deactivated meanwhile shows the error under Performed by; nothing is saved', async ({ page }) => {
    await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
    await openStaffTicket(page, L4.inactiveAssignee);
    await page.getByRole('button', { name: 'Add Action' }).click();
    await page.getByLabel(/Action Description/).fill('Hand over to the leaving colleague');
    await page.getByLabel(/Performed by/).selectOption({ label: E2E_STAFF_LEAVING.name });
    await setUserActive(E2E_STAFF_LEAVING.email, false);
    try {
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      const error = page.locator('#performedById-error');
      await expect(error).toHaveText("This person can't be assigned (inactive or not IT Staff).");
      await expect(page.getByLabel(/Performed by/)).toHaveAttribute('aria-describedby', 'performedById-error');
      expect(await apiActions(page, L4.inactiveAssignee)).toHaveLength(0);
    } finally {
      await setUserActive(E2E_STAFF_LEAVING.email, true);
    }
  });
});

test.describe('E2E-03: full action lifecycle', () => {
  test('E2E-03: create 3 actions; start + complete one, cancel one, edit one; all listed in order with the right badges', async ({ page }) => {
    await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
    await openStaffTicket(page, L4.lifecycle);
    for (const d of ['Lifecycle one: reinstall driver', 'Lifecycle two: order part', 'Lifecycle three: call back']) await addAction(page, d);

    await viewAction(page, 'Lifecycle one: reinstall driver');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('table tbody tr').first()).toContainText('In Progress'); // reloaded before reopening
    await viewAction(page, 'Lifecycle one: reinstall driver');
    await page.getByLabel(/^Result/).fill('Driver reinstalled, device works.');
    await page.getByRole('button', { name: 'Complete' }).click();
    await expect(page.getByRole('region', { name: 'Action details' })).toBeHidden();

    await viewAction(page, 'Lifecycle two: order part');
    await page.getByRole('button', { name: 'Cancel action' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Yes, cancel action' }).click();
    await expect(page.getByRole('region', { name: 'Action details' })).toBeHidden();

    await viewAction(page, 'Lifecycle three: call back');
    await page.getByLabel(/Action Description/).fill('Lifecycle three: call back on Monday');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('region', { name: 'Action details' })).toBeHidden();

    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Lifecycle one: reinstall driver');
    await expect(rows.nth(0)).toContainText('Completed');
    await expect(rows.nth(0)).toContainText('Driver reinstalled, device works.');
    await expect(rows.nth(1)).toContainText('Cancelled');
    await expect(rows.nth(1).getByTestId('action-description')).toHaveCSS('text-decoration-line', 'line-through');
    await expect(rows.nth(2)).toContainText('Lifecycle three: call back on Monday');
    await expect(rows.nth(2)).toContainText('Planned');
    await expect(page.getByRole('heading', { name: 'Actions Taken (3)' })).toBeVisible();
  });
});

test.describe('E2E-09: stale edit in two browser contexts', () => {
  test('E2E-09: the second save shows the conflict message and the latest values', async ({ page, browser }) => {
    const other = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      for (const p of [page, other]) {
        await login(p, E2E_STAFF_A.email, FIXTURE_PASSWORD);
        await openStaffTicket(p, L4.stale);
        await viewAction(p, 'Call the Requester back');
      }
      await page.getByLabel(/Action Description/).fill('Call the Requester back - first editor');
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByRole('region', { name: 'Action details' })).toBeHidden();

      await other.getByLabel(/Action Description/).fill('Call the Requester back - second editor');
      await other.getByRole('button', { name: 'Save changes' }).click();
      await expect(other.getByText('Someone else updated this action. The latest version is shown.')).toBeVisible();
      await expect(other.getByLabel(/Action Description/)).toHaveValue('Call the Requester back - first editor');
      await expect(other.getByText('Call the Requester back - second editor')).toBeVisible(); // "Your unsaved text"
      expect((await apiActions(page, L4.stale))[0]!.description).toBe('Call the Requester back - first editor');
    } finally {
      await other.close();
    }
  });
});

test.describe('RESP-02: Actions Taken at 320 / 768 / 1280', () => {
  for (const vp of VIEWPORTS) {
    test(`RESP-02: Actions Taken at ${vp.name}: ${vp.width >= 992 ? 'table' : 'cards'}, no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
      await openStaffTicket(page, L4.severalActions);
      const table = page.locator('table', { has: page.getByRole('columnheader', { name: 'Performed by' }) });
      if (vp.width >= 992) await expect(table).toBeVisible();
      else {
        await expect(table).toBeHidden();
        await expect(page.getByRole('button', { name: /^View action:/ }).filter({ visible: true })).toHaveCount(5);
      }
      await noHorizontalScroll(page);
    });
  }
});

test.describe('A11Y-01: keyboard-only Actions Taken', () => {
  test('A11Y-01: create, complete and cancel with the keyboard; visible focus; the dialog traps focus and Esc returns it', async ({ page }) => {
    await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
    await openStaffTicket(page, L4.keyboard);

    // Create.
    for (const d of ['Keyboard one', 'Keyboard two']) {
      await tabTo(page, page.getByRole('button', { name: 'Add Action' }));
      expect(await hasVisibleFocus(page)).toBe(true);
      await page.keyboard.press('Enter');
      await tabTo(page, page.getByLabel(/Action Description/));
      await page.keyboard.type(d);
      await tabTo(page, page.getByRole('button', { name: 'Save', exact: true }));
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('action-description').filter({ hasText: d }).first()).toBeVisible();
    }

    // Complete.
    await tabTo(page, page.getByRole('button', { name: 'View action: Keyboard one' }).first());
    await page.keyboard.press('Enter');
    await tabTo(page, page.getByLabel(/^Result/));
    await page.keyboard.type('Done by keyboard.');
    await tabTo(page, page.getByRole('button', { name: 'Complete' }));
    await page.keyboard.press('Enter');
    await expect(page.locator('table tbody tr').first()).toContainText('Completed');

    // Cancel: the dialog traps focus, Esc closes it and focus returns to the opener.
    await tabTo(page, page.getByRole('button', { name: 'View action: Keyboard two' }).first());
    await page.keyboard.press('Enter');
    const opener = page.getByRole('button', { name: 'Cancel action' });
    await tabTo(page, opener);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await page.keyboard.press('Enter');
    await tabTo(page, page.getByRole('dialog').getByRole('button', { name: 'Yes, cancel action' }));
    await page.keyboard.press('Enter');
    await expect(page.locator('table tbody tr').nth(1)).toContainText('Cancelled');
  });
});

test.describe('A11Y-01: mobile sheet keyboard', () => {
  test('A11Y-01: on the < 768 px sheet Tab and Shift+Tab stay inside the panel, Esc closes it and focus returns to View', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
    await openStaffTicket(page, L4.severalActions);
    const opener = page.getByRole('button', { name: 'View action: Update the access point firmware' }).filter({ visible: true });
    await opener.click();
    const sheet = page.getByRole('region', { name: 'Action details' });
    const inside = () => sheet.evaluate((el) => el.contains(document.activeElement));
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      expect(await inside()).toBe(true);
    }
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside()).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(opener).toBeFocused();
  });
});

test.describe('FAIL-02: action save network failure', () => {
  test('FAIL-02: a lost response keeps the typed values, and the second Save creates exactly one action', async ({ page }) => {
    await login(page, E2E_STAFF_A.email, FIXTURE_PASSWORD);
    await openStaffTicket(page, L4.saveFailure);
    let failed = false;
    // The request reaches the server but the response is lost: the retry must not duplicate it (FR-21).
    await page.route(`**/api/staff/tickets/${L4.saveFailure}/actions`, async (route) => {
      if (route.request().method() === 'POST' && !failed) {
        failed = true;
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Add Action' }).click();
    await page.getByLabel(/Action Description/).fill('Replace the keyboard');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Unable to reach the TokTickIT API.')).toBeVisible();
    await expect(page.getByLabel(/Action Description/)).toHaveValue('Replace the keyboard');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('region', { name: 'New action' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Actions Taken (1)' })).toBeVisible();
    expect(await apiActions(page, L4.saveFailure)).toHaveLength(1);
  });
});
