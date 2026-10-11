// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatReport, pendingAsk, reportChat, takeAsk, chatStatusWanted } from '../../admin/src/askStore';
import { InquiriesList } from '../../admin/src/components/InquiriesList';
import { QuestionsList } from '../../admin/src/components/QuestionsList';
import { RequestsBoard } from '../../admin/src/components/RequestsBoard';
import { PENDING_VIEW } from './fake-inquiries';
import { renderInTheme } from './render';

/*
 * Ask about this on the rows of the three lists, over a stand-in for Strapi's fetch client. The chat is not here: the store is how a row talks to
 * it, so the tests report what the chat would report and read what a click leaves for it.
 */
const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const notify = vi.hoisted(() => ({ toggleNotification: vi.fn() }));
vi.mock('@strapi/strapi/admin', () => ({ useFetchClient: () => client, useNotification: () => notify }));

const APPOINTMENT = {
  reference: 'APT-4821',
  status: 'requested',
  customer: 'line:U4af…88',
  boutique: { slug: 'ginza', name: 'Ginza' },
  requestedFor: '2099-10-10T14:00:00+09:00',
  products: [],
  note: 'Please call me.',
  createdVia: 'concierge',
  confirmationSent: false,
  demoCustomer: false,
  yourLine: false,
  createdAt: '2026-10-08T01:00:00.000Z',
};
const QUESTION = {
  reference: 'Q-4821',
  customer: 'line:U4af…88',
  customerName: null,
  question: 'Is it waterproof?',
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
  createdAt: '2026-10-08T01:00:00.000Z',
};

beforeEach(() => {
  client.get.mockReset();
  client.get.mockImplementation(async (url: string) => {
    if (url === '/maison/appointments') return { data: { appointments: [APPOINTMENT] } };
    if (url === '/maison/questions') return { data: { questions: [QUESTION] } };
    if (url === '/maison/inquiries') return { data: { inquiries: [PENDING_VIEW] } };
    if (url === '/maison/inquiries/quota') return { data: { used: 0, limit: 200, remaining: 200, type: 'none', hasToken: true } };
    throw new Error(`Unexpected GET ${url}`);
  });
});
afterEach(() => {
  reportChat(null);
});

const askButtons = () => screen.queryAllByRole('button', { name: 'Ask about this' });
const rows = {
  requests: () => renderInTheme(<RequestsBoard canConfirm={false} refreshKey={0} />),
  questions: () => renderInTheme(<QuestionsList canAnswer={false} refreshKey={0} draft={null} onDraftTaken={() => {}} />),
  inquiries: () => renderInTheme(<InquiriesList canReply={false} refreshKey={0} summary={null} summaryError={null} onChange={() => {}} draft={null} onDraftTaken={() => {}} />),
};
const ITEMS = [
  ['requests', 'APT-4821', 'Tell me about request APT-4821.'],
  ['questions', 'Q-4821', 'Tell me about question Q-4821.'],
  ['inquiries', 'inq-1', 'Tell me about inquiry inq-1.'],
] as const;

describe.each(ITEMS)('Ask about this on the %s list', (name, reference, message) => {
  it('is not shown when no chat is on the screen: an admin who may not use the assistant', async () => {
    rows[name]();
    await screen.findByText(reference.startsWith('inq') ? PENDING_VIEW.message : reference);
    expect(askButtons()).toHaveLength(0);
    // And the list has no empty column for it.
    expect(screen.queryByText('Actions')).toBeNull();
  });

  it('is not shown while the assistant is not ready', async () => {
    reportChat({ ready: false, busy: false });
    rows[name]();
    await screen.findByText(reference.startsWith('inq') ? PENDING_VIEW.message : reference);
    expect(askButtons()).toHaveLength(0);
  });

  it('is shown once the assistant is ready, for admins with none of the list\'s own permissions, and leaves the message for the chat when pressed', async () => {
    reportChat({ ready: true, busy: false });
    rows[name]();
    const [button] = await screen.findAllByRole('button', { name: 'Ask about this' });
    expect(askButtons()).toHaveLength(1);
    expect((button as HTMLButtonElement).disabled).toBe(false);
    // The row's own buttons need its own permission: this admin has none.
    for (const own of ['Confirm', 'Send again', 'Answer', 'Let them know', 'Reply on LINE', 'Change label']) expect(screen.queryByRole('button', { name: own })).toBeNull();

    await userEvent.click(button);

    expect(pendingAsk()).toBe(message);
    expect(takeAsk()).toBe(message);
  });

  it('waits while an answer is on its way: shown, switched off, and a click does nothing', async () => {
    reportChat({ ready: true, busy: true });
    rows[name]();
    const [button] = await screen.findAllByRole('button', { name: 'Ask about this' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(button);
    expect(pendingAsk()).toBeNull();
  });

  it('asks for the assistant to be checked while it is on the screen, and stops asking when it has gone', async () => {
    const view = rows[name]();
    expect(chatStatusWanted()).toBe(true);
    view.unmount();
    expect(chatStatusWanted()).toBe(false);
  });

  it('appears when the chat reports that it is ready, and goes when the chat goes', async () => {
    rows[name]();
    await screen.findByText(reference.startsWith('inq') ? PENDING_VIEW.message : reference);
    expect(askButtons()).toHaveLength(0);

    act(() => reportChat({ ready: true, busy: false }));
    await waitFor(() => expect(askButtons()).toHaveLength(1));

    act(() => reportChat(null));
    await waitFor(() => expect(askButtons()).toHaveLength(0));
    expect(chatReport()).toBeNull();
  });
});

describe('Ask about this next to a row\'s own buttons', () => {
  it('sits after Confirm on a request, for an admin who may confirm', async () => {
    reportChat({ ready: true, busy: false });
    renderInTheme(<RequestsBoard canConfirm refreshKey={0} />);
    const confirm = await screen.findByRole('button', { name: 'Confirm' });
    const cell = confirm.closest('td') as HTMLElement;
    expect(within(cell).getAllByRole('button').map((button) => button.textContent)).toEqual(['Confirm', 'Ask about this']);
  });

  it('sits after Answer on a question, for an admin who may answer', async () => {
    reportChat({ ready: true, busy: false });
    renderInTheme(<QuestionsList canAnswer refreshKey={0} draft={null} onDraftTaken={() => {}} />);
    const answer = await screen.findByRole('button', { name: 'Answer' });
    const cell = answer.closest('td') as HTMLElement;
    expect(within(cell).getAllByRole('button').map((button) => button.textContent)).toEqual(['Let them know', 'Answer', 'Ask about this']);
  });

  it('sits after Change label on an inquiry, for an admin who may reply', async () => {
    reportChat({ ready: true, busy: false });
    renderInTheme(<InquiriesList canReply refreshKey={0} summary={null} summaryError={null} onChange={() => {}} draft={null} onDraftTaken={() => {}} />);
    const change = await screen.findByRole('button', { name: 'Change label' });
    const cell = change.closest('td') as HTMLElement;
    const labels = within(cell).getAllByRole('button').map((button) => button.textContent);
    expect(labels.at(-1)).toBe('Ask about this');
    expect(labels).toContain('Reply on LINE');
  });
});
