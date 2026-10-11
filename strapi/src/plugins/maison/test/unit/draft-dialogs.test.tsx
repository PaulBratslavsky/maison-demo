// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerDialog } from '../../admin/src/components/AnswerDialog';
import { InquiryReplyDialog } from '../../admin/src/components/InquiryReplyDialog';
import { DRAFTED_LINE } from '../../admin/src/drafts';
import type { StaffInquiry } from '../../admin/src/inquiries';
import type { StaffQuestion } from '../../admin/src/questions';
import { PENDING_VIEW } from './fake-inquiries';
import { renderInTheme } from './render';

/*
 * The two dialogs that send to a customer, opened with a draft. With `initialText` the box starts with the draft and a line above it says so; opened
 * from a row, the dialogs are as they were. Either way what is in the box when staff press Send on LINE is what goes.
 */
const INQUIRY = PENDING_VIEW as unknown as StaffInquiry;
const QUESTION: StaffQuestion = {
  reference: 'Q-4821',
  customer: 'line:U4af…88',
  customerName: 'Aiko T.',
  question: 'Can the coffret hold a watch?',
  reason: 'no_answer',
  language: 'en',
  product: null,
  status: 'open',
  staffName: null,
  takenAt: null,
  answeredAt: null,
  answer: null,
  addedToKnowledge: false,
  line: null,
  yourLine: false,
  createdAt: '2026-10-06T00:30:00.000Z',
};
const DRAFT = 'Thank you for telling us.\nA member of our team will write to you today.';

// jsdom has no ResizeObserver, which the design system's text box and its checkbox use.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const replyDialog = (props: Partial<Parameters<typeof InquiryReplyDialog>[0]> = {}) => (
  <InquiryReplyDialog inquiry={INQUIRY} sending={false} cannotSendBecause={null} onSend={() => {}} onClose={() => {}} {...props} />
);
const answerDialog = (props: Partial<Parameters<typeof AnswerDialog>[0]> = {}) => (
  <AnswerDialog question={QUESTION} sending={false} onSend={() => {}} onClose={() => {}} {...props} />
);

describe('Reply on LINE', () => {
  it('opens empty from a row, with no line about a draft', () => {
    renderInTheme(replyDialog());
    expect((screen.getByRole('textbox', { name: 'Your reply' }) as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByText(DRAFTED_LINE)).toBeNull();
  });

  it('opens with the draft in the box and says above it that the assistant wrote it', () => {
    renderInTheme(replyDialog({ initialText: DRAFT }));

    const box = screen.getByRole('textbox', { name: 'Your reply' }) as HTMLTextAreaElement;
    expect(box.value).toBe(DRAFT);
    const line = screen.getByText(DRAFTED_LINE);
    // Above the box, so staff read it before they read the text.
    expect(line.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // The dialog puts the focus straight into the box, so a screen reader reads what describes the box. The line about the draft is part of it.
  it('describes the box by the line about the draft too, so a screen reader user hears it', () => {
    renderInTheme(replyDialog({ initialText: DRAFT }));
    const box = screen.getByRole('textbox', { name: 'Your reply' });
    const line = screen.getByText(DRAFTED_LINE);
    expect(line.id).not.toBe('');
    const ids = box.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(ids).toContain(line.id);
    // The box is still described by its hint: the other id is the element that carries the hint's words.
    const hint = ids.filter((id) => id !== line.id).map((id) => document.getElementById(id)?.textContent);
    expect(hint).toEqual([expect.stringContaining('sent on LINE as Maison')]);
  });

  it('describes the box by its hint alone when staff opened it from a row', () => {
    renderInTheme(replyDialog());
    const box = screen.getByRole('textbox', { name: 'Your reply' });
    expect(box.getAttribute('aria-describedby')?.split(' ')).toHaveLength(1);
    expect(document.getElementById(box.getAttribute('aria-describedby') as string)?.textContent).toContain('sent on LINE as Maison');
  });

  it('describes a drafted box that is too long by the line and the error, in place of the hint', async () => {
    renderInTheme(replyDialog({ initialText: 'x'.repeat(2001) }));
    const box = screen.getByRole('textbox', { name: 'Your reply' });
    const ids = box.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([DRAFTED_LINE, 'A reply can have up to 2,000 characters.']);
  });

  it('reads the draft once: a later change of the prop does not replace what staff are writing', async () => {
    const view = renderInTheme(replyDialog({ initialText: DRAFT }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Your reply' }), ' Edited.');

    view.rerender(replyDialog({ initialText: 'Another draft.' }));

    expect((screen.getByRole('textbox', { name: 'Your reply' }) as HTMLTextAreaElement).value).toBe(`${DRAFT} Edited.`);
  });

  it('sends what is in the box when staff press Send on LINE, edited or not: nothing is sent before', async () => {
    const onSend = vi.fn();
    renderInTheme(replyDialog({ initialText: DRAFT, onSend }));
    expect(onSend).not.toHaveBeenCalled();

    await userEvent.type(screen.getByRole('textbox', { name: 'Your reply' }), ' Edited.');
    await userEvent.click(screen.getByRole('button', { name: 'Send on LINE' }));

    expect(onSend).toHaveBeenCalledExactlyOnceWith({ text: `${DRAFT} Edited.` });
  });

  it('still can be cleared and written again', async () => {
    const onSend = vi.fn();
    renderInTheme(replyDialog({ initialText: DRAFT, onSend }));
    const box = screen.getByRole('textbox', { name: 'Your reply' });

    await userEvent.clear(box);
    expect((screen.getByRole('button', { name: 'Send on LINE' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(box, 'Thank you.');
    await userEvent.click(screen.getByRole('button', { name: 'Send on LINE' }));

    expect(onSend).toHaveBeenCalledExactlyOnceWith({ text: 'Thank you.' });
  });

  it('keeps the limits: a draft of 2,001 characters cannot be sent', () => {
    renderInTheme(replyDialog({ initialText: 'x'.repeat(2001) }));
    expect((screen.getByRole('button', { name: 'Send on LINE' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Answer', () => {
  it('opens empty from a row, with no line about a draft', () => {
    renderInTheme(answerDialog());
    expect((screen.getByRole('textbox', { name: 'Your answer' }) as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByText(DRAFTED_LINE)).toBeNull();
  });

  it('describes the box by the line about the draft too, so a screen reader user hears it', () => {
    renderInTheme(answerDialog({ initialText: DRAFT }));
    const box = screen.getByRole('textbox', { name: 'Your answer' });
    const line = screen.getByText(DRAFTED_LINE);
    expect(line.id).not.toBe('');
    const ids = box.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(ids).toContain(line.id);
    const hint = ids.filter((id) => id !== line.id).map((id) => document.getElementById(id)?.textContent);
    expect(hint).toEqual([expect.stringContaining('sent on LINE in your name')]);
  });

  it('opens with the draft in the box and says above it that the assistant wrote it', () => {
    renderInTheme(answerDialog({ initialText: DRAFT }));

    const box = screen.getByRole('textbox', { name: 'Your answer' }) as HTMLTextAreaElement;
    expect(box.value).toBe(DRAFT);
    const line = screen.getByText(DRAFTED_LINE);
    expect(line.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // Staff read and edit the text, and the dialog says it is a draft, so the answer is still worth keeping (Paul, 6 October).
  it('keeps Add to product knowledge ticked, for a draft as for any answer', () => {
    renderInTheme(answerDialog({ initialText: DRAFT }));
    expect(screen.getByRole('checkbox', { name: 'Add to product knowledge' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('textbox', { name: 'Title in product knowledge' })).toBeTruthy();
  });

  it('reads the draft once: a later change of the prop does not replace what staff are writing', async () => {
    const view = renderInTheme(answerDialog({ initialText: DRAFT }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Your answer' }), ' Edited.');

    view.rerender(answerDialog({ initialText: 'Another draft.' }));

    expect((screen.getByRole('textbox', { name: 'Your answer' }) as HTMLTextAreaElement).value).toBe(`${DRAFT} Edited.`);
  });

  it('sends nothing until staff press Send on LINE, and then sends what is in the box', async () => {
    const onSend = vi.fn();
    renderInTheme(answerDialog({ initialText: DRAFT, onSend }));
    // Untick the knowledge entry, so no category is needed to send.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Add to product knowledge' }));
    expect(onSend).not.toHaveBeenCalled();

    await userEvent.type(screen.getByRole('textbox', { name: 'Your answer' }), ' Edited.');
    await userEvent.click(screen.getByRole('button', { name: 'Send on LINE' }));

    expect(onSend).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ text: `${DRAFT} Edited.`, addToKnowledge: false }));
  });
});
