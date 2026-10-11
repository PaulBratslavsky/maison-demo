// @vitest-environment jsdom
import { lightTheme, darkTheme } from '@strapi/design-system';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DraftCard } from '../../admin/src/components/assistant/DraftCard';
import type { DraftCardModel } from '../../admin/src/assistant';
import { declarationsOf } from './css';
import { renderInTheme } from './render';

/*
 * A draft in the chat: the title that names the item, the text as plain text, and Use this draft when the admin may use it. Nothing here sends anything.
 */
const REPLY: DraftCardModel = { callId: 'call_1', draft: { kind: 'reply', documentId: 'inq4abc', text: 'Thank you for telling us.\nA member of our team will write to you today.' } };
const ANSWER: DraftCardModel = { callId: 'call_2', draft: { kind: 'answer', reference: 'Q-4821', text: 'Yes. A watch up to 42 mm fits in the coffret.' } };
const TITLE = 'Draft reply on LINE: line:U4af…88, received 2026-10-06 10:12';

describe('the draft card', () => {
  it('shows the title and the text, with the text\'s line breaks', () => {
    renderInTheme(<DraftCard model={REPLY} title={TITLE} canUse onUse={() => {}} />);

    expect(screen.getByText(TITLE)).toBeTruthy();
    const body = screen.getByText(/Thank you for telling us/);
    expect(body.textContent).toBe('Thank you for telling us.\nA member of our team will write to you today.');
    expect(declarationsOf(body)).toMatchObject({ 'white-space': 'pre-wrap' });
  });

  it('is a group named by its title, so a screen reader says what the draft is for', () => {
    renderInTheme(<DraftCard model={ANSWER} title="Draft answer for Q-4821" canUse onUse={() => {}} />);
    expect(screen.getByRole('group', { name: 'Draft answer for Q-4821' })).toBeTruthy();
  });

  // A label with the same words as the text inside the group makes a screen reader say the title twice on entering the card.
  it('takes its name from the title that is on the card, and not from a second copy of it', () => {
    renderInTheme(<DraftCard model={ANSWER} title="Draft answer for Q-4821" canUse onUse={() => {}} />);
    const card = screen.getByRole('group');
    const title = screen.getByText('Draft answer for Q-4821');
    expect(card.getAttribute('aria-label')).toBeNull();
    expect(title.id).not.toBe('');
    expect(card.getAttribute('aria-labelledby')).toBe(title.id);
  });

  it('gives two cards two different title ids', () => {
    renderInTheme(
      <>
        <DraftCard model={ANSWER} title="Draft answer for Q-4821" canUse onUse={() => {}} />
        <DraftCard model={REPLY} title={TITLE} canUse onUse={() => {}} />
      </>
    );
    const ids = screen.getAllByRole('group').map((card) => card.getAttribute('aria-labelledby'));
    expect(new Set(ids).size).toBe(2);
  });

  it('shows the text as plain text: Markdown and HTML in it are not drawn', () => {
    const model: DraftCardModel = { callId: 'c', draft: { kind: 'answer', reference: 'Q-4821', text: '**not bold** <b>nor this</b> [a link](https://example.com)' } };
    const { container } = renderInTheme(<DraftCard model={model} title="Draft answer for Q-4821" canUse onUse={() => {}} />);

    expect(container.querySelector('strong, b, a, img')).toBeNull();
    expect(screen.getByText('**not bold** <b>nor this</b> [a link](https://example.com)')).toBeTruthy();
  });

  it('has one button, Use this draft, and hands the draft to the page when it is pressed', async () => {
    const onUse = vi.fn();
    renderInTheme(<DraftCard model={REPLY} title={TITLE} canUse onUse={onUse} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Use this draft' }));

    expect(onUse).toHaveBeenCalledExactlyOnceWith(REPLY.draft);
  });

  it('shows no button to an admin who may not use the draft, and still shows the draft', () => {
    renderInTheme(<DraftCard model={REPLY} title={TITLE} canUse={false} onUse={() => {}} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.getByText(/Thank you for telling us/)).toBeTruthy();
  });

  it('wraps a long word instead of widening the bubble', () => {
    const model: DraftCardModel = { callId: 'c', draft: { kind: 'reply', documentId: 'inq4abc', text: 'x'.repeat(300) } };
    renderInTheme(<DraftCard model={model} title={TITLE} canUse onUse={() => {}} />);
    expect(declarationsOf(screen.getByText('x'.repeat(300)))).toMatchObject({ 'overflow-wrap': 'anywhere' });
  });

  it.each([
    ['light', false, lightTheme],
    ['dark', true, darkTheme],
  ])('takes its colours from the %s theme', (_name, dark, theme) => {
    renderInTheme(<DraftCard model={REPLY} title={TITLE} canUse onUse={() => {}} />, { dark });
    const card = screen.getByRole('group');
    const styles = declarationsOf(card);
    expect(styles['background']).toBe(theme.colors.neutral0);
    expect(styles['border']).toContain(theme.colors.neutral200);
    expect(declarationsOf(screen.getByText(TITLE))['color']).toBe(theme.colors.neutral800);
  });
});
