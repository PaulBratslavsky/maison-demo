// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { STARTERS } from '../../admin/src/assistant';
import { EmptyState } from '../../admin/src/components/assistant/EmptyState';
import { renderInTheme } from './render';

describe('EmptyState', () => {
  it('has the title, the one sentence, and the three starters as buttons', () => {
    renderInTheme(<EmptyState onStarter={() => {}} canStart={() => true} />);
    expect(screen.getByText('Ask Maison')).toBeTruthy();
    expect(screen.getByText('Ask about visit requests, customer questions and inquiries. The assistant looks things up and never sends, confirms or changes anything.')).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Suggestions' });
    expect(Array.from(group.querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      'What are customers asking about today?',
      'Any complaints this week?',
      'Which visits are waiting for staff?',
    ]);
    expect(STARTERS).toHaveLength(3);
  });

  it("sends a starter's own text when it is pressed", async () => {
    const onStarter = vi.fn();
    renderInTheme(<EmptyState onStarter={onStarter} canStart={() => true} />);
    await userEvent.click(screen.getByRole('button', { name: 'Any complaints this week?' }));
    expect(onStarter).toHaveBeenCalledExactlyOnceWith('Any complaints this week?');
  });

  it('switches off each starter whose send would not work, and sends nothing for it', async () => {
    const onStarter = vi.fn();
    renderInTheme(<EmptyState onStarter={onStarter} canStart={(text) => text !== 'Any complaints this week?'} />);
    const off = screen.getByRole('button', { name: 'Any complaints this week?' }) as HTMLButtonElement;
    expect(off.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Which visits are waiting for staff?' }) as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(off);
    expect(onStarter).not.toHaveBeenCalled();
  });

  it('asks canStart about each starter text, as the starters are written', () => {
    const canStart = vi.fn((_text: string) => true);
    renderInTheme(<EmptyState onStarter={() => {}} canStart={canStart} />);
    expect(canStart.mock.calls.map(([text]) => text)).toEqual(expect.arrayContaining([...STARTERS]));
  });
});
