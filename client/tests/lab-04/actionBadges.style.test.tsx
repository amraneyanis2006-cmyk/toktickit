import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { ActionStatusBadge } from '../../src/components/ActionsTaken';

let css: string;

beforeAll(() => {
  css = fs.readFileSync(path.resolve(__dirname, '../../src/styles/zen-green.css'), 'utf-8');
});

function rule(className: string) {
  const match = css.match(new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`));
  expect(match, className).not.toBeNull();
  const body = match![1]!;
  return {
    bg: body.match(/background-color:\s*([^;]+);/)?.[1]?.trim(),
    color: body.match(/(?<!background-)color:\s*([^;]+);/)?.[1]?.trim(),
  };
}

describe('Action badges (ui-spec sec 1)', () => {
  it('STYLE-01: each new badge uses the ui-spec sec 1 token pair', () => {
    expect(rule('zg-badge-action-planned')).toEqual({ bg: 'var(--zg-neutral-bg)', color: 'var(--zg-neutral-text)' });
    expect(rule('zg-badge-action-in_progress')).toEqual({ bg: 'var(--zg-warning-bg)', color: 'var(--zg-warning)' });
    expect(rule('zg-badge-action-completed')).toEqual({ bg: 'var(--zg-pale)', color: 'var(--zg-primary)' });
    expect(rule('zg-badge-action-cancelled')).toEqual({ bg: 'var(--zg-error-bg)', color: 'var(--zg-text-muted)' });
    expect(rule('zg-badge-followup')).toEqual({ bg: '#FCE7D6', color: '#C2540D' });
    expect(rule('zg-badge-awaiting-review')).toEqual({ bg: 'var(--zg-info-bg)', color: 'var(--zg-info-text)' });
    for (const token of ['--zg-info-bg: #E7F0FA', '--zg-info-text: #1F5F9C', '--zg-neutral-bg: #E8ECE9', '--zg-neutral-text: #4C5C54']) {
      expect(css).toContain(token);
    }
  });

  it('STYLE-01: badges keep the shared pill shape and always carry a text label', () => {
    render(
      <>
        <ActionStatusBadge status="PLANNED" />
        <ActionStatusBadge status="IN_PROGRESS" />
        <ActionStatusBadge status="COMPLETED" />
        <ActionStatusBadge status="CANCELLED" />
      </>
    );
    for (const [label, cls] of [['Planned', 'planned'], ['In Progress', 'in_progress'], ['Completed', 'completed'], ['Cancelled', 'cancelled']]) {
      const badge = screen.getByText(label!);
      expect(badge).toHaveClass('zg-badge', `zg-badge-action-${cls}`);
    }
  });
});
