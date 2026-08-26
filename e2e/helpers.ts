import { Page } from '@playwright/test';

export async function selectRequester(page: Page, requesterName?: string) {
  await page.goto('/select-requester');
  const select = page.getByLabel('Development Requester');
  await select.waitFor({ state: 'visible' });

  if (requesterName) {
    await select.selectOption({ label: requesterName });
  } else {
    // pick the first real option (index 0 is the disabled placeholder)
    const options = await select.locator('option').all();
    const value = await options[1].getAttribute('value');
    await select.selectOption(value!);
  }

  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.waitForURL('**/tickets');
}