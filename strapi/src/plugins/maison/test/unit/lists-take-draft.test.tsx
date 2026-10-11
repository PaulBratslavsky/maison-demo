// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InquiriesList } from '../../admin/src/components/InquiriesList';
import { QuestionsList } from '../../admin/src/components/QuestionsList';
import { DRAFTED_LINE, NOT_FOUND_NOTICE, type PageDraft } from '../../admin/src/drafts';
import type { StaffInquiry } from '../../admin/src/inquiries';
import type { StaffQuestion } from '../../admin/src/questions';
import { PENDING_VIEW } from './fake-inquiries';
import { renderInTheme } from './render';

/*
 * The two lists take the draft the page holds: they load the item again, and either open the dialog with the text in it or say why they can't. Nothing
 * is sent here. The lists run over a stand-in for Strapi's fetch client.
 */
const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const notify = vi.hoisted(() => ({ toggleNotification: vi.fn() }));
vi.mock('@strapi/strapi/admin', () => ({ useFetchClient: () => client, useNotification: () => notify }));

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
const TEXT = 'Thank you for telling us.\nA member of our team will write to you today.';
const REPLY: PageDraft = { kind: 'reply', documentId: 'inq-1', text: TEXT };
const ANSWER: PageDraft = { kind: 'answer', reference: 'Q-4821', text: TEXT };

/** What the server answers for the item routes, by URL. Each test sets the item, or an error to throw. */
const world = vi.hoisted(() => ({ item: null as unknown, failure: null as unknown, hold: null as null | Promise<void> }));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  world.item = null;
  world.failure = null;
  world.hold = null;
  client.get.mockReset();
  notify.toggleNotification.mockReset();
  client.get.mockImplementation(async (url: string) => {
    if (url === '/maison/inquiries') return { data: { inquiries: [INQUIRY] } };
    if (url === '/maison/inquiries/quota') return { data: { configured: true, sent: 0, limit: 200 } };
    if (url === '/maison/questions') return { data: { questions: [QUESTION] } };
    if (url.startsWith('/maison/inquiries/') || url.startsWith('/maison/questions/')) {
      if (world.hold) await world.hold;
      if (world.failure) throw world.failure;
      return { data: url.startsWith('/maison/inquiries/') ? { inquiry: world.item } : { question: world.item } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const itemCalls = () => client.get.mock.calls.map(([url]) => url as string).filter((url) => /^\/maison\/(inquiries|questions)\/[^/]+$/.test(url) && !url.endsWith('/quota'));

const inquiries = (draft: PageDraft | null, onDraftTaken = vi.fn()) => ({
  onDraftTaken,
  view: renderInTheme(<InquiriesList canReply refreshKey={0} summary={null} summaryError={null} onChange={() => {}} draft={draft} onDraftTaken={onDraftTaken} />),
});
const questions = (draft: PageDraft | null, onDraftTaken = vi.fn()) => ({
  onDraftTaken,
  view: renderInTheme(<QuestionsList canAnswer refreshKey={0} onChange={() => {}} draft={draft} onDraftTaken={onDraftTaken} />),
});

describe('the Inquiries list, given a reply draft', () => {
  it('loads the inquiry again, opens Reply on LINE over the rows with the text and the line about the draft, and tells the page', async () => {
    world.item = { ...INQUIRY };
    const { onDraftTaken } = inquiries(REPLY);

    const box = (await screen.findByRole('textbox', { name: 'Your reply' })) as HTMLTextAreaElement;

    expect(itemCalls()).toEqual(['/maison/inquiries/inq-1']);
    expect(box.value).toBe(TEXT);
    expect(screen.getByText(DRAFTED_LINE)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reply on LINE' })).toBeTruthy();
    expect(notify.toggleNotification).not.toHaveBeenCalled();
    await waitFor(() => expect(onDraftTaken).toHaveBeenCalledExactlyOnceWith(REPLY));
  });

  it('asks for the item by its documentId, written safely in the address', async () => {
    world.item = { ...INQUIRY, documentId: 'a/b c' };
    inquiries({ ...REPLY, documentId: 'a/b c' });
    await screen.findByRole('textbox', { name: 'Your reply' });
    expect(itemCalls()).toEqual(['/maison/inquiries/a%2Fb%20c']);
  });

  it('takes the draft once: a new render with the same draft, and the list\'s refreshes, do not load it again', async () => {
    world.item = { ...INQUIRY };
    const { view, onDraftTaken } = inquiries(REPLY);
    await screen.findByRole('textbox', { name: 'Your reply' });

    view.rerender(<InquiriesList canReply refreshKey={1} summary={null} summaryError={null} onChange={() => {}} draft={REPLY} onDraftTaken={onDraftTaken} />);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(itemCalls()).toEqual(['/maison/inquiries/inq-1']);
  });

  it.each([
    ['replied', { status: 'replied', repliedBy: 'Jane' }, "This inquiry was replied to already. The draft wasn't used."],
    ['closed', { status: 'closed', closeReason: 'not-needed' }, "This inquiry is closed. The draft wasn't used."],
    ['handed off', { handedOff: true, question: { reference: 'Q-4821', status: 'open' } }, 'This inquiry is answered under Questions (Q-4821).'],
  ])('says why, and opens no dialog, for an inquiry that was %s meanwhile', async (_label, fields, message) => {
    world.item = { ...INQUIRY, ...fields };
    const { onDraftTaken } = inquiries(REPLY);

    await waitFor(() => expect(onDraftTaken).toHaveBeenCalledExactlyOnceWith(REPLY));

    expect(notify.toggleNotification).toHaveBeenCalledExactlyOnceWith({ type: 'info', message });
    expect(screen.queryByRole('textbox', { name: 'Your reply' })).toBeNull();
  });

  it('says the item is gone for a 404, and opens no dialog', async () => {
    world.failure = Object.assign(new Error('No inquiry "inq-1".'), { status: 404 });
    const { onDraftTaken } = inquiries(REPLY);

    await waitFor(() => expect(onDraftTaken).toHaveBeenCalledExactlyOnceWith(REPLY));

    expect(notify.toggleNotification).toHaveBeenCalledExactlyOnceWith({ type: 'info', message: NOT_FOUND_NOTICE });
    expect(screen.queryByRole('textbox', { name: 'Your reply' })).toBeNull();
  });

  it('shows another failure as a danger notice in its own words, and still tells the page', async () => {
    world.failure = Object.assign(new Error('Strapi is down.'), { status: 500 });
    const { onDraftTaken } = inquiries(REPLY);

    await waitFor(() => expect(onDraftTaken).toHaveBeenCalledExactlyOnceWith(REPLY));

    expect(notify.toggleNotification).toHaveBeenCalledExactlyOnceWith({ type: 'danger', message: 'Strapi is down.' });
  });

  it('shows no notice when the request was cancelled because the tab was left, and still tells the page, so the draft is not taken again', async () => {
    world.failure = new DOMException('signal is aborted without reason', 'AbortError');
    const { onDraftTaken } = inquiries(REPLY);

    await waitFor(() => expect(onDraftTaken).toHaveBeenCalledExactlyOnceWith(REPLY));

    expect(notify.toggleNotification).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Your reply' })).toBeNull();
  });

  it('opens no dialog on a tab that was left while the inquiry loaded, and still tells the page', async () => {
    let release: () => void = () => {};
    world.hold = new Promise((resolve) => {
      release = resolve;
    });
    world.item = { ...INQUIRY };
    const { view, onDraftTaken } = inquiries(REPLY);
    await waitFor(() => expect(itemCalls()).toHaveLength(1));

    view.unmount();
    release();

    await waitFor(() => expect(onDraftTaken).toHaveBeenCalledExactlyOnceWith(REPLY));
    expect(screen.queryByRole('textbox', { name: 'Your reply' })).toBeNull();
  });

  it('leaves a draft for a question alone: it loads nothing and does not tell the page', async () => {
    const { onDraftTaken } = inquiries(ANSWER);
    await screen.findByText(INQUIRY.message);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(itemCalls()).toEqual([]);
    expect(onDraftTaken).not.toHaveBeenCalled();
  });

  it('opens Reply on LINE empty from a row, with no line about a draft', async () => {
    const { onDraftTaken } = inquiries(null);
    await userEvent.click(await screen.findByRole('button', { name: 'Reply on LINE' }));

    expect((await screen.findByRole('textbox', { name: 'Your reply' })) as HTMLTextAreaElement).toHaveProperty('value', '');
    expect(screen.queryByText(DRAFTED_LINE)).toBeNull();
    expect(onDraftTaken).not.toHaveBeenCalled();
  });

  it('takes a second draft after the first was taken: the same draft can be used again', async () => {
    world.item = { ...INQUIRY };
    const { view, onDraftTaken } = inquiries(REPLY);
    await screen.findByRole('textbox', { name: 'Your reply' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const props = { canReply: true, refreshKey: 0, summary: null, summaryError: null, onChange: () => {}, onDraftTaken };

    view.rerender(<InquiriesList {...props} draft={null} />);
    view.rerender(<InquiriesList {...props} draft={{ ...REPLY }} />);

    await screen.findByRole('textbox', { name: 'Your reply' });
    expect(itemCalls()).toEqual(['/maison/inquiries/inq-1', '/maison/inquiries/inq-1']);
  });
});

describe('the Questions list, given an answer draft', () => {
  it('loads the question again, opens Answer over the rows with the text and the line about the draft, with Add to product knowledge ticked, and tells the page', async () => {
    world.item = { ...QUESTION };
    const { onDraftTaken } = questions(ANSWER);

    const box = (await screen.findByRole('textbox', { name: 'Your answer' })) as HTMLTextAreaElement;

    expect(itemCalls()).toEqual(['/maison/questions/Q-4821']);
    expect(box.value).toBe(TEXT);
    expect(screen.getByText(DRAFTED_LINE)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Answer Q-4821' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Add to product knowledge' }).getAttribute('aria-checked')).toBe('true');
    expect(notify.toggleNotification).not.toHaveBeenCalled();
    await waitFor(() => expect(onDraftTaken).toHaveBeenCalledExactlyOnceWith(ANSWER));
  });

  it('opens Answer for a question a staff member took: it can still be answered', async () => {
    world.item = { ...QUESTION, status: 'taken', staffName: 'Jane' };
    questions(ANSWER);
    expect(await screen.findByRole('textbox', { name: 'Your answer' })).toBeTruthy();
  });

  it('says the question was answered already, and opens no dialog', async () => {
    world.item = { ...QUESTION, status: 'answered', staffName: 'Hana' };
    const { onDraftTaken } = questions(ANSWER);

    await waitFor(() => expect(onDraftTaken).toHaveBeenCalledExactlyOnceWith(ANSWER));

    expect(notify.toggleNotification).toHaveBeenCalledExactlyOnceWith({ type: 'info', message: "Q-4821 was answered already. The draft wasn't used." });
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).toBeNull();
  });

  it('says the item is gone for a 404, and opens no dialog', async () => {
    world.failure = Object.assign(new Error('No question Q-4821.'), { status: 404 });
    const { onDraftTaken } = questions(ANSWER);

    await waitFor(() => expect(onDraftTaken).toHaveBeenCalledExactlyOnceWith(ANSWER));

    expect(notify.toggleNotification).toHaveBeenCalledExactlyOnceWith({ type: 'info', message: NOT_FOUND_NOTICE });
  });

  it('shows no notice when the request was cancelled because the tab was left, and still tells the page', async () => {
    world.failure = new DOMException('signal is aborted without reason', 'AbortError');
    const { onDraftTaken } = questions(ANSWER);

    await waitFor(() => expect(onDraftTaken).toHaveBeenCalledExactlyOnceWith(ANSWER));

    expect(notify.toggleNotification).not.toHaveBeenCalled();
  });

  it('opens no dialog on a tab that was left while the question loaded, and still tells the page', async () => {
    let release: () => void = () => {};
    world.hold = new Promise((resolve) => {
      release = resolve;
    });
    world.item = { ...QUESTION };
    const { view, onDraftTaken } = questions(ANSWER);
    await waitFor(() => expect(itemCalls()).toHaveLength(1));

    view.unmount();
    release();

    await waitFor(() => expect(onDraftTaken).toHaveBeenCalledExactlyOnceWith(ANSWER));
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).toBeNull();
  });

  it('takes the draft once: a new render with the same draft does not load it again', async () => {
    world.item = { ...QUESTION };
    const { view, onDraftTaken } = questions(ANSWER);
    await screen.findByRole('textbox', { name: 'Your answer' });

    view.rerender(<QuestionsList canAnswer refreshKey={1} onChange={() => {}} draft={ANSWER} onDraftTaken={onDraftTaken} />);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(itemCalls()).toEqual(['/maison/questions/Q-4821']);
  });

  it('leaves a draft for an inquiry alone', async () => {
    const { onDraftTaken } = questions(REPLY);
    await screen.findByText(QUESTION.question);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(itemCalls()).toEqual([]);
    expect(onDraftTaken).not.toHaveBeenCalled();
  });

  it('opens Answer empty from a row, with no line about a draft', async () => {
    questions(null);
    await userEvent.click(await screen.findByRole('button', { name: 'Answer' }));

    expect(((await screen.findByRole('textbox', { name: 'Your answer' })) as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByText(DRAFTED_LINE)).toBeNull();
  });
});
