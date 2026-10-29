// Shared helpers for the Lab 4 Playwright specs (fixtures: e2e/global-setup.ts setupLab4).
import { expect, request } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { E2E_ADMIN, FIXTURE_PASSWORD } from '../global-setup';

export const API = 'http://localhost:3000/api';

export const VIEWPORTS = [
  { name: 'desktop-1280', width: 1280, height: 900 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-320', width: 320, height: 800 },
] as const;

export async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

/** Nothing inside a card sticks out of it (clipped or overflowing content). */
export async function nothingClipped(page: Page, selector: string) {
  const clipped = await page.locator(selector).evaluateAll((cards) => cards.flatMap((card) => {
    const box = card.getBoundingClientRect();
    return [...card.querySelectorAll('*')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1); })
      .map((el) => `${el.tagName} "${(el.textContent ?? '').trim().slice(0, 30)}"`);
  }));
  expect(clipped).toEqual([]);
}

/** Metric card value by its h2 label. */
export function metric(page: Page, label: string): Locator {
  return page.locator('.zg-metric', { has: page.getByRole('heading', { level: 2, name: label, exact: true }) }).locator('.zg-metric-value');
}

/** Total of a My Tickets / Ticket Queue list ("of N tickets", or 0 when the filtered list is empty). */
export async function listTotal(page: Page): Promise<number> {
  const total = page.getByText(/of \d+ tickets/);
  const none = page.getByText('No tickets match your filters.');
  await expect(total.or(none).first()).toBeVisible();
  if (await none.isVisible()) return 0;
  return Number((await total.textContent())!.match(/of (\d+) tickets/)![1]);
}

/** Opens a Staff Ticket Detail and waits for the Actions Taken section. */
export async function openStaffTicket(page: Page, ticketNumber: string) {
  await page.goto(`/staff/tickets/${ticketNumber}`);
  await expect(page.getByRole('heading', { name: /^Actions Taken \(\d+\)$/ })).toBeVisible();
}

/** Creates an action through the UI panel and waits until it is listed. */
export async function addAction(page: Page, description: string) {
  await page.getByRole('button', { name: 'Add Action' }).click();
  await page.getByLabel(/Action Description/).fill(description);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('region', { name: 'New action' })).toBeHidden();
  await expect(page.getByTestId('action-description').filter({ hasText: description }).first()).toBeVisible();
}

/** Opens the panel of the listed action with this description (table at >= 992 px, cards below). */
export async function viewAction(page: Page, description: string) {
  await page.getByRole('button', { name: `View action: ${description}` }).filter({ visible: true }).first().click();
  await expect(page.getByRole('region', { name: 'Action details' })).toBeVisible();
}

/** Actions of a ticket straight from the API, with the session of `page`. */
export async function apiActions(page: Page, ticketNumber: string): Promise<Array<{ id: number; description: string; status: string; updatedAt: string }>> {
  const res = await page.request.get(`${API}/staff/tickets/${ticketNumber}/actions`);
  expect(res.ok()).toBe(true);
  return (await res.json()).data;
}

/** Sets a user's isActive through the admin API, in a separate request context. */
export async function setUserActive(email: string, isActive: boolean) {
  const ctx = await request.newContext();
  try {
    expect((await ctx.post(`${API}/auth/login`, { data: { email: E2E_ADMIN.email, password: FIXTURE_PASSWORD } })).ok()).toBe(true);
    const [user] = await (await ctx.get(`${API}/admin/users?search=${encodeURIComponent(email)}`)).json();
    const res = await ctx.patch(`${API}/admin/users/${user.id}`, { data: { isActive } });
    expect(res.ok(), await res.text()).toBe(true);
  } finally {
    await ctx.dispose();
  }
}

/** Presses Tab until `target` has focus (max 60 presses); proves it is reachable by keyboard. */
export async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 60; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) {
      expect(await hasVisibleFocus(page), `visible focus on ${target}`).toBe(true);
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Not reachable by Tab: ${target}`);
}

/** The focused element shows a visible focus indicator (outline or box-shadow ring). */
export async function hasVisibleFocus(page: Page) {
  return page.evaluate(() => {
    const s = getComputedStyle(document.activeElement as Element);
    return (s.outlineStyle !== 'none' && s.outlineWidth !== '0px') || (s.boxShadow !== 'none' && s.boxShadow !== '');
  });
}
