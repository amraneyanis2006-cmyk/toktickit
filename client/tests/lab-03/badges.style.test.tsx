import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

// STYLE-01: reads the real stylesheet and checks every badge class actually
// used in the app has a rule, and that every status/priority/role/active
// badge is visually distinct from every other one in the same family -
// this is exactly the check that would have caught the 4 Lab 3 statuses
// (WAITING_FOR_REQUESTER, CLOSED, REOPENED, CANCELLED) rendering with no
// color at all, found during this pass.

let css: string;

beforeAll(() => {
  const cssPath = path.resolve(__dirname, '../../src/styles/zen-green.css');
  css = fs.readFileSync(cssPath, 'utf-8');
});

function ruleFor(className: string): { bg: string; color: string } | null {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\.${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 's');
  const match = css.match(re);
  if (!match) return null;
  const body = match[1]!;
  const bg = body.match(/background-color:\s*([^;]+);/)?.[1]?.trim();
  const color = body.match(/(?<!background-)color:\s*([^;]+);/)?.[1]?.trim();
  if (!bg || !color) return null;
  return { bg, color };
}

function resolveVar(value: string): string {
  const match = value.match(/^var\((--[\w-]+)/);
  if (!match) return value;
  const varName = match[1]!;
  const re = new RegExp(`${varName}:\\s*([^;]+);`);
  return css.match(re)?.[1]?.trim() ?? value;
}

describe('Badge tokens (STYLE-01)', () => {
  const STATUSES = [
    'new', 'open', 'in_progress', 'waiting_for_requester',
    'resolved', 'closed', 'reopened', 'cancelled',
  ];
  const PRIORITIES = ['low', 'medium', 'high'];
  const ROLES = ['requester', 'it_staff', 'administrator'];

  it.each(STATUSES)('zg-badge-status-%s has a background and text color rule', (status) => {
    const rule = ruleFor(`zg-badge-status-${status}`);
    expect(rule, `No CSS rule found for .zg-badge-status-${status}`).not.toBeNull();
  });

  it.each(PRIORITIES)('zg-badge-priority-%s has a background and text color rule', (priority) => {
    const rule = ruleFor(`zg-badge-priority-${priority}`);
    expect(rule, `No CSS rule found for .zg-badge-priority-${priority}`).not.toBeNull();
  });

  it.each(ROLES)('zg-badge-role-%s has a background and text color rule', (role) => {
    const rule = ruleFor(`zg-badge-role-${role}`);
    expect(rule, `No CSS rule found for .zg-badge-role-${role}`).not.toBeNull();
  });

  it('zg-badge-active-true and zg-badge-active-false both have rules', () => {
    expect(ruleFor('zg-badge-active-true')).not.toBeNull();
    expect(ruleFor('zg-badge-active-false')).not.toBeNull();
  });

  it('every status has a distinct label text (color alone never carries the meaning, ui-spec.md sec 11)', () => {
    // NEW and RESOLVED intentionally share the same green token from Lab 2 -
    // both are "good/no-action" states. That is allowed as long as the
    // label text differentiates them, which it always does (the status name).
    const labels = STATUSES.map((s) => s.replace(/_/g, ' '));
    expect(new Set(labels).size).toBe(STATUSES.length);
  });

  it('the 4 Lab 3 statuses (WAITING_FOR_REQUESTER, CLOSED, REOPENED, CANCELLED) are each distinct from every Lab 2 status and from each other', () => {
    // This is the exact regression found during #20: these 4 had no CSS rule
    // at all and rendered as colorless pills since #16/#17/#18.
    const LAB3_STATUSES = ['waiting_for_requester', 'closed', 'reopened', 'cancelled'];
    const pairs = STATUSES.map((s) => {
      const rule = ruleFor(`zg-badge-status-${s}`)!;
      return [s, `${resolveVar(rule.bg)}|${resolveVar(rule.color)}`] as const;
    });
    for (const lab3Status of LAB3_STATUSES) {
      const [, ownColor] = pairs.find(([s]) => s === lab3Status)!;
      for (const [otherStatus, otherColor] of pairs) {
        if (otherStatus === lab3Status) continue;
        expect(
          otherColor,
          `${lab3Status} shares its color with ${otherStatus} - they must be visually distinguishable`
        ).not.toBe(ownColor);
      }
    }
  });

  it('every priority badge is visually distinct from every other priority badge', () => {
    const pairs = PRIORITIES.map((p) => {
      const rule = ruleFor(`zg-badge-priority-${p}`)!;
      return `${resolveVar(rule.bg)}|${resolveVar(rule.color)}`;
    });
    expect(new Set(pairs).size).toBe(PRIORITIES.length);
  });

  it('every role badge is visually distinct from every other role badge', () => {
    const pairs = ROLES.map((r) => {
      const rule = ruleFor(`zg-badge-role-${r}`)!;
      return `${resolveVar(rule.bg)}|${resolveVar(rule.color)}`;
    });
    expect(new Set(pairs).size).toBe(ROLES.length);
  });

  it('active and inactive badges are visually distinct from each other', () => {
    const active = ruleFor('zg-badge-active-true')!;
    const inactive = ruleFor('zg-badge-active-false')!;
    expect(`${resolveVar(active.bg)}|${resolveVar(active.color)}`).not.toBe(
      `${resolveVar(inactive.bg)}|${resolveVar(inactive.color)}`
    );
  });
});
