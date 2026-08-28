import { test, expect } from '@playwright/test';

test.describe('E2E-05: Inactive Requester exclusion', () => {
  test('inactive Requester never appears in the selection dropdown', async ({ page }) => {
    await page.goto('/select-requester');
    const select = page.getByLabel('Development Requester');
    await select.waitFor({ state: 'visible' });

    const optionLabels = await select.locator('option').allTextContents();
    expect(optionLabels).not.toContain('Robert Wilson');
  });

  test('GET /api/requesters excludes inactive Requesters at the API level', async ({ request }) => {
    const res = await request.get('http://localhost:3000/api/requesters');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const names = body.map((r: { name: string }) => r.name);
    expect(names).not.toContain('Robert Wilson');
  });
});
