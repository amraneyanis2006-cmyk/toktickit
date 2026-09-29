import { test, expect } from '@playwright/test';
import { login } from '../helpers';
import {
  E2E_REQUESTER_A,
  E2E_INACTIVE,
  E2E_MUST_CHANGE_LOGIN,
  E2E_MUST_CHANGE_VIEW,
  E2E_MUST_CHANGE_INITIAL_PASSWORD,
  FIXTURE_PASSWORD,
} from '../global-setup';

test.describe('E2E-01: Login -> browse -> logout -> blocked access', () => {
  test('full session lifecycle: browse while authenticated, then logout blocks direct URL access', async ({ page }) => {
    await login(page, E2E_REQUESTER_A.email, FIXTURE_PASSWORD);
    await expect(page).toHaveURL(/\/tickets$/);
    await page.waitForSelector('tbody tr');

    await page.locator('tbody tr').first().click();
    await page.waitForURL('**/tickets/TKT-*');
    await expect(page.getByText('Ticket Details')).toBeVisible();

    await page.getByRole('button', { name: /E2E Requester A/i }).click();
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL('**/login');

    // Direct URL access to a protected route after logout redirects to Login,
    // rather than briefly flashing the protected screen.
    await page.goto('/tickets');
    await page.waitForURL('**/login');
  });

  test('a deactivated account cannot log in', async ({ page }) => {
    await page.request.post('http://localhost:3000/api/auth/logout').catch(() => {});
    await page.goto('/login');
    await page.getByLabel('Email').fill(E2E_INACTIVE.email);
    await page.getByLabel('Password', { exact: true }).fill(FIXTURE_PASSWORD);
    await page.getByRole('button', { name: 'Log In' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('AC-02, E2E-02: Initial password login and change', () => {
  test('the normal app opens only after a valid password change', async ({ page }) => {
    await login(page, E2E_MUST_CHANGE_LOGIN.email, E2E_MUST_CHANGE_INITIAL_PASSWORD);
    await expect(page).toHaveURL(/\/change-password$/);

    // The gate holds even on a direct navigation attempt, not just the initial redirect.
    await page.goto('/tickets');
    await expect(page).toHaveURL(/\/change-password$/);

    await page.getByLabel(/current \(temporary\) password/i).fill(E2E_MUST_CHANGE_INITIAL_PASSWORD);
    await page.getByLabel(/^new password$/i).fill('E2eChosenPass1!');
    await page.getByLabel(/confirm new password/i).fill('E2eChosenPass1!');
    await page.getByRole('button', { name: 'Save New Password' }).click();

    // Normal app opens now - lands on the Requester's own home, not stuck on /change-password.
    await page.waitForURL('**/tickets');
    await page.goto('/tickets');
    await expect(page).toHaveURL(/\/tickets$/);
  });
});

test.describe('E2E-03: Requester ticket lifecycle + comment + resolved indication', () => {
  test('create a ticket, post a Public Comment, mark it resolved-indicated', async ({ page }) => {
    await login(page, E2E_REQUESTER_A.email, FIXTURE_PASSWORD);

    await page.getByRole('link', { name: '+ Create Ticket' }).click();
    await page.waitForURL('**/tickets/new');
    await page.waitForSelector('#category');
    await page.selectOption('#category', { index: 1 });
    await page.selectOption('#relatedSystem', { index: 1 });
    await page.selectOption('#priority', { index: 1 });
    await page.fill('#summary', 'E2E-03 full requester lifecycle ticket');
    await page.fill('#description', 'Created end-to-end by E2E-03: create, comment, mark resolved-indication.');
    await page.getByRole('button', { name: 'Submit Ticket' }).click();
    await page.waitForSelector('text=Ticket created');

    const ticketNumber = (await page.locator('.fs-3.fw-bold').textContent())!.trim();
    await page.goto(`/tickets/${ticketNumber}`);

    await page.getByPlaceholder('Type your comment here...').fill('E2E-03 fixture comment.');
    await page.getByRole('button', { name: 'Post Comment' }).click();
    await expect(page.getByText('E2E-03 fixture comment.')).toBeVisible();

    const resolveButton = page.getByRole('button', { name: 'Problem Appears Resolved' });
    await resolveButton.click();
    await expect(page.getByRole('button', { name: 'You indicated this is resolved' })).toBeDisabled();

    // requesterIndicatedResolved is a separate signal - it never changes the formal status.
    await expect(page.getByText('NEW')).toBeVisible();
  });
});

test.describe('RESP-03: Login/Change Password at 320px / 768px / 1280px', () => {
  const WIDTHS: Array<{ name: string; width: number; height: number }> = [
    { name: 'mobile-320', width: 320, height: 700 },
    { name: 'tablet-768', width: 768, height: 900 },
    { name: 'desktop-1280', width: 1280, height: 900 },
  ];

  for (const bp of WIDTHS) {
    test(`Login idle + failure state at ${bp.name}, single column, no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.request.post('http://localhost:3000/api/auth/logout').catch(() => {});
      await page.goto('/login');

      let hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasHorizontalScroll).toBe(false);
      await page.screenshot({ path: `artifacts/lab-03/screenshots/login/${bp.name}-idle.png`, fullPage: true });

      await page.getByLabel('Email').fill(E2E_REQUESTER_A.email);
      await page.getByLabel('Password', { exact: true }).fill('definitely-wrong-password');
      await page.getByRole('button', { name: 'Log In' }).click();
      await expect(page.getByRole('alert')).toBeVisible();

      hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasHorizontalScroll).toBe(false);
      await page.screenshot({ path: `artifacts/lab-03/screenshots/login/${bp.name}-failure.png`, fullPage: true });
    });

    test(`Change Password at ${bp.name}, single column, no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await login(page, E2E_MUST_CHANGE_VIEW.email, E2E_MUST_CHANGE_INITIAL_PASSWORD);
      await expect(page).toHaveURL(/\/change-password$/);

      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasHorizontalScroll).toBe(false);
      await page.screenshot({ path: `artifacts/lab-03/screenshots/change-password/${bp.name}.png`, fullPage: true });
    });
  }
});

test.describe('A11Y-01: Login/Change Password keyboard and focus', () => {
  test('the login form is completable with the keyboard alone, no mouse', async ({ page }) => {
    await page.request.post('http://localhost:3000/api/auth/logout').catch(() => {});
    await page.goto('/login');

    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Email')).toBeFocused();
    await page.keyboard.type(E2E_REQUESTER_A.email);

    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
    await page.keyboard.type(FIXTURE_PASSWORD);

    await page.keyboard.press('Enter');
    await page.waitForURL('**/tickets');
  });

  test('the focused email field shows a visible focus outline', async ({ page }) => {
    await page.request.post('http://localhost:3000/api/auth/logout').catch(() => {});
    await page.goto('/login');

    const email = page.getByLabel('Email');
    const before = await email.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow };
    });

    await page.keyboard.press('Tab');
    await expect(email).toBeFocused();
    const after = await email.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow };
    });

    // A visible focus indicator exists if something actually changed (outline
    // or box-shadow) between unfocused and focused - not asserting a specific
    // technique, since ui-spec.md sec 11 only requires it stays visible, not
    // how it is implemented.
    const changed =
      after.outlineStyle !== before.outlineStyle ||
      after.outlineWidth !== before.outlineWidth ||
      after.boxShadow !== before.boxShadow;
    expect(changed).toBe(true);
  });

  test('Login/Change Password fields all have an associated label (getByLabel resolves for every field)', async ({ page }) => {
    await page.request.post('http://localhost:3000/api/auth/logout').catch(() => {});
    await page.goto('/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();

    await login(page, E2E_MUST_CHANGE_VIEW.email, E2E_MUST_CHANGE_INITIAL_PASSWORD);
    await expect(page.getByLabel(/current \(temporary\) password/i)).toBeVisible();
    await expect(page.getByLabel(/^new password$/i)).toBeVisible();
    await expect(page.getByLabel(/confirm new password/i)).toBeVisible();
  });
});
