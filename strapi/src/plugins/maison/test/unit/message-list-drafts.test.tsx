// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DraftLinkProvider, type DraftLink } from '../../admin/src/components/assistant/draftLink';
import { MessageList } from '../../admin/src/components/assistant/MessageList';
import { NO_DRAFT_ACCESS } from '../../admin/src/drafts';
import { renderInTheme } from './render';

/*
 * Draft cards in the message list: inside the assistant's bubble, in the order they arrived, titled from the chat's lookup of the item, and with
 * Use this draft only for an admin who may use it.
 */
type Part = Record<string, any>;
const text = (content: string): Part => ({ type: 'text', content });
const staff = (id: string, content = 'Draft a reply to the complaint.') => ({ id, role: 'user', parts: [text(content)] }) as never;
const assistant = (id: string, parts: Part[]) => ({ id, role: 'assistant', parts }) as never;

const ROW = { documentId: 'inq4abc', customer: 'line:U4af…88', receivedAt: '2026-10-06T10:12:00+09:00' };
const lookup = (id = 'c0'): Part => ({ type: 'tool-call', id, name: 'list_inquiries', arguments: '{}', state: 'complete', output: { inquiries: [ROW], capped: false } });
const DRAFT = { documentId: 'inq4abc', text: 'Thank you for telling us.\nA member of our team will write to you today.' };
const replyCall = (id = 'c1', fields: Part = {}): Part => ({
  type: 'tool-call',
  id,
  name: 'draft_reply',
  arguments: JSON.stringify(DRAFT),
  input: DRAFT,
  state: 'complete',
  output: { shown: true },
  ...fields,
});
const resultOf = (id = 'c1', fields: Part = {}): Part => ({ type: 'tool-result', toolCallId: id, state: 'complete', content: '{"shown":true}', ...fields });

const MAY_REPLY = { ...NO_DRAFT_ACCESS, canView: true, canReply: true };
const link = (fields: Partial<DraftLink> = {}): DraftLink => ({ access: MAY_REPLY, openDraft: vi.fn(), ...fields });
const show = (messages: unknown[], draftLink: DraftLink = link(), props: Partial<Parameters<typeof MessageList>[0]> = {}) =>
  renderInTheme(
    <DraftLinkProvider value={draftLink}>
      <MessageList messages={messages as never} busy={false} {...props} />
    </DraftLinkProvider>
  );

const cards = () => screen.queryAllByRole('group');

describe('a draft card in the message list', () => {
  it('is drawn inside the assistant\'s bubble, with the title from the chat\'s lookup of the inquiry, and the text', () => {
    const { container } = show([staff('u1'), assistant('a1', [lookup(), replyCall(), resultOf()])]);

    const [row] = Array.from(container.querySelectorAll('[data-message-role="assistant"]')) as HTMLElement[];
    const card = within(row).getByRole('group', { name: 'Draft reply on LINE: line:U4af…88, received 2026-10-06 10:12' });
    expect(within(card).getByText(/Thank you for telling us/)).toBeTruthy();
    // The card is in the bubble that has the label, and no tool line or box stands for the draft call.
    expect(within(row).getByText('Assistant')).toBeTruthy();
    expect(container.querySelectorAll('[data-message-part="tool"]')).toHaveLength(1);
  });

  it('is drawn in the order the parts arrived: text, the card, more text', () => {
    const { container } = show([staff('u1'), assistant('a1', [text('Here is a draft.'), replyCall(), resultOf(), text('Check the strap before you use it.')])]);

    const bubble = cards()[0].parentElement as HTMLElement;
    const children = Array.from(bubble.children).map((child) => child.textContent ?? '');
    const at = (needle: string) => children.findIndex((content) => content.includes(needle));
    expect(at('Here is a draft.')).toBeGreaterThan(-1);
    expect(at('Here is a draft.')).toBeLessThan(at('Thank you for telling us.'));
    expect(at('Thank you for telling us.')).toBeLessThan(at('Check the strap before you use it.'));
    expect(container.querySelectorAll('[data-message-role="assistant"]')).toHaveLength(1);
  });

  it('is a message of its own, with no other part, as the model\'s turn that called the tool', () => {
    const { container } = show([staff('u1'), assistant('a1', [replyCall(), resultOf()]), assistant('a2', [text('The draft is ready.')])]);

    expect(container.querySelectorAll('[data-message-role="assistant"]')).toHaveLength(2);
    expect(cards()).toHaveLength(1);
  });

  it('titles a draft for an inquiry the chat never looked up by its documentId alone, so a wrong documentId shows on the card', () => {
    show([staff('u1'), assistant('a1', [replyCall()])]);
    expect(screen.getByRole('group', { name: 'Draft reply on LINE: inq4abc' })).toBeTruthy();
  });

  it('takes the title from a lookup in an earlier message', () => {
    show([staff('u1'), assistant('a1', [lookup()]), assistant('a2', [replyCall('c2'), resultOf('c2')])]);
    expect(screen.getByRole('group', { name: /line:U4af…88, received 2026-10-06 10:12/ })).toBeTruthy();
  });

  it('is an answer card for a draft_answer, titled by its reference', () => {
    const answer = { reference: 'Q-4821', text: 'Yes. A watch up to 42 mm fits.' };
    const call: Part = { type: 'tool-call', id: 'c3', name: 'draft_answer', arguments: JSON.stringify(answer), input: answer, state: 'complete', output: { shown: true } };
    show([staff('u1'), assistant('a1', [call])], link({ access: { ...NO_DRAFT_ACCESS, canRead: true, canAnswer: true } }));
    expect(screen.getByRole('group', { name: 'Draft answer for Q-4821' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use this draft' })).toBeTruthy();
  });

  it('shows nothing for a draft call that has not come back from the page yet, or that failed', () => {
    show([
      staff('u1'),
      assistant('a1', [replyCall('c1', { state: 'input-complete', output: undefined })]),
      assistant('a2', [replyCall('c2', { state: 'error', output: { error: 'Input validation failed for tool draft_reply: too big' } }), resultOf('c2', { state: 'error' }), text('I will write a shorter one.')]),
    ]);

    expect(cards()).toHaveLength(0);
    expect(screen.queryByText(/Input validation failed/)).toBeNull();
    expect(screen.getByText('I will write a shorter one.')).toBeTruthy();
  });

  it('keeps a message that holds only a card on the screen: it is not an empty bubble', () => {
    const { container } = show([staff('u1'), assistant('a1', [replyCall(), resultOf()])]);
    expect(container.querySelectorAll('[data-message-role="assistant"]')).toHaveLength(1);
  });

  describe('Use this draft', () => {
    it('hands the draft to the page when it is pressed', async () => {
      const openDraft = vi.fn();
      show([staff('u1'), assistant('a1', [replyCall(), resultOf()])], link({ openDraft }));

      await userEvent.click(screen.getByRole('button', { name: 'Use this draft' }));

      expect(openDraft).toHaveBeenCalledExactlyOnceWith({ kind: 'reply', documentId: 'inq4abc', text: DRAFT.text });
    });

    it('shows only to an admin who holds both permissions of the pair', () => {
      for (const [access, shown] of [
        [{ ...NO_DRAFT_ACCESS, canView: true, canReply: true }, true],
        [{ ...NO_DRAFT_ACCESS, canView: true }, false],
        [{ ...NO_DRAFT_ACCESS, canReply: true }, false],
        [{ ...NO_DRAFT_ACCESS, canRead: true, canAnswer: true }, false],
        [NO_DRAFT_ACCESS, false],
      ] as const) {
        const view = show([staff('u1'), assistant('a1', [replyCall(), resultOf()])], link({ access }));
        expect(screen.queryAllByRole('button', { name: 'Use this draft' }), JSON.stringify(access)).toHaveLength(shown ? 1 : 0);
        // The draft itself is still there to read.
        expect(cards()).toHaveLength(1);
        view.unmount();
      }
    });

    it('shows no button where nothing says what the admin may do', () => {
      renderInTheme(<MessageList messages={[staff('u1'), assistant('a1', [replyCall(), resultOf()])] as never} busy={false} />);
      expect(cards()).toHaveLength(1);
      expect(screen.queryByRole('button', { name: 'Use this draft' })).toBeNull();
    });
  });

  it('does not say the assistant is working once the card is on the screen', () => {
    show([staff('u1'), assistant('a1', [replyCall(), resultOf()])], link(), { busy: true });
    expect(screen.queryByRole('status', { name: 'Assistant is replying' })).toBeNull();
  });
});
