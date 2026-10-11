// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pendingDraft, takeDraft } from '../../admin/src/draftStore';
import { GlobalAssistant } from '../../admin/src/components/assistant/GlobalAssistant';
import { DRAFTED_LINE, NOT_FOUND_NOTICE, type DraftAccess } from '../../admin/src/drafts';
import type { StaffInquiry } from '../../admin/src/inquiries';
import type { StaffQuestion } from '../../admin/src/questions';
import MaisonPage from '../../admin/src/pages/MaisonPage';
import { assistantWorld, savedChat } from './fake-assistant-world';
import { PENDING_VIEW } from './fake-inquiries';
import { renderInTheme } from './render';

/*
 * Use this draft, from the card in the assistant's drawer to the dialog on the Maison page, with every real part in between: the card, the drawer's
 * link, the router, the page, the list that loads the item again, and the dialog. The drawer and the page are two React trees in Strapi, so here the
 * drawer is rendered beside the router, and is given the router's navigate as the menu icon gives it to the host. Only Strapi's fetch client, its
 * permissions and its notifications are stand-ins. Nothing is sent: the test stops at the open dialog.
 */
const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
const rbac = vi.hoisted(() => ({ flags: {} as Record<string, boolean> }));
const notify = vi.hoisted(() => ({ toggleNotification: vi.fn() }));
vi.mock('@strapi/strapi/admin', () => ({
  useFetchClient: () => client,
  useNotification: () => notify,
  useRBAC: () => ({ isLoading: false, allowedActions: rbac.flags, permissions: [], error: undefined }),
  Page: {
    Protect: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Main: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
    Title: () => null,
    Loading: () => <p>Loading</p>,
  },
}));

const INQUIRY = { ...(PENDING_VIEW as unknown as StaffInquiry), documentId: 'inq-1' };
const QUESTION: StaffQuestion = {
  reference: 'Q-4821',
  customer: 'line:U4af…88',
  customerName: null,
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
const REPLY_TEXT = 'Thank you for telling us.\nA member of our team will write to you today.';
const ANSWER_TEXT = 'Yes. A watch up to 42 mm fits in the coffret.';
const chat = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', content: 'Draft a reply to inq-1.' }] },
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      { type: 'tool-call', id: 'c1', name: 'draft_reply', arguments: '{}', input: { documentId: 'inq-1', text: REPLY_TEXT }, state: 'complete', output: { shown: true } },
      { type: 'tool-result', toolCallId: 'c1', state: 'complete', content: '{"shown":true}' },
    ],
  },
  {
    id: 'a2',
    role: 'assistant',
    parts: [
      { type: 'tool-call', id: 'c2', name: 'draft_answer', arguments: '{}', input: { reference: 'Q-4821', text: ANSWER_TEXT }, state: 'complete', output: { shown: true } },
      { type: 'tool-result', toolCallId: 'c2', state: 'complete', content: '{"shown":true}' },
    ],
  },
];

const EVERYTHING: DraftAccess = { canView: true, canReply: true, canRead: true, canAnswer: true };
const world = { inquiry: INQUIRY as unknown, question: QUESTION as unknown, failure: null as unknown };

/** Strapi's router around the page, and the drawer beside it, which gets the router's navigate. */
const Admin = ({ path }: { path: string }) => {
  const Drawer = () => {
    const navigate = useNavigate();
    return <GlobalAssistant access={EVERYTHING} navigate={navigate} />;
  };
  const Where = () => {
    const { pathname, search } = useLocation();
    return <p data-testid="location">{`${pathname}${search}`}</p>;
  };
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/plugins/maison" element={<MaisonPage />} />
        <Route path="*" element={<p>Another page</p>} />
      </Routes>
      <Drawer />
      <Where />
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  rbac.flags = { canReview: true, canConfirm: true, canManage: true, canRead: true, canAnswer: true, canView: true, canReply: true, canUse: true };
  world.inquiry = INQUIRY;
  world.question = QUESTION;
  world.failure = null;
  notify.toggleNotification.mockReset();
  assistantWorld(client, { saved: [savedChat('c1', 'Two drafts', chat)] });
  const chatGet = client.get.getMockImplementation() as (url: string) => Promise<unknown>;
  client.get.mockImplementation(async (url: string) => {
    if (url === '/maison/inquiries') return { data: { inquiries: [INQUIRY] } };
    if (url === '/maison/inquiries/quota') return { data: { configured: true, used: 0, limit: 200 } };
    if (url === '/maison/questions') return { data: { questions: [QUESTION] } };
    if (url === '/maison/appointments') return { data: { appointments: [] } };
    if (url.startsWith('/maison/inquiries/') || url.startsWith('/maison/questions/')) {
      if (world.failure) throw world.failure;
      return { data: url.startsWith('/maison/inquiries/') ? (world.inquiry === null ? {} : { inquiry: world.inquiry }) : { question: world.question } };
    }
    if (url.startsWith('/maison/appointments/') || url === '/maison/inquiries/summary') throw new Error('Not needed here.');
    return chatGet(url);
  });
});
afterEach(() => {
  takeDraft();
  vi.unstubAllGlobals();
});

const openDrawer = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Open the Maison assistant' }));
  await within(await screen.findByRole('region', { name: 'Chat messages' })).findAllByRole('group');
};
const useButtons = () => screen.getAllByRole('button', { name: 'Use this draft' });
const where = () => screen.getByTestId('location').textContent;

describe('Use this draft, end to end', () => {
  it('takes a reply from another page to the Inquiries tab and opens Reply on LINE with the text, the line about the draft, and nothing sent', async () => {
    renderInTheme(<Admin path="/content-manager" />);
    await openDrawer();

    await userEvent.click(useButtons()[0]);

    expect(where()).toBe('/plugins/maison?tab=inquiries');
    const box = (await screen.findByRole('textbox', { name: 'Your reply' })) as HTMLTextAreaElement;
    expect(box.value).toBe(REPLY_TEXT);
    expect(screen.getByText(DRAFTED_LINE)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reply on LINE' })).toBeTruthy();
    // The text is in no address, the draft was taken by the list, and nothing was posted.
    expect(where()).not.toContain('Thank');
    await waitFor(() => expect(pendingDraft()).toBeNull());
    expect(client.post).not.toHaveBeenCalled();
  });

  it('opens Reply on LINE on the Inquiries tab when the admin is already on the Maison page, on another tab, and the drawer stays open', async () => {
    renderInTheme(<Admin path="/plugins/maison?tab=questions" />);
    await openDrawer();

    await userEvent.click(useButtons()[0]);

    expect(await screen.findByRole('textbox', { name: 'Your reply' })).toBeTruthy();
    expect(where()).toBe('/plugins/maison?tab=inquiries');
    // The dialog is modal, so the page behind it, the drawer included, is hidden from the accessibility tree while it is open. The drawer is still there.
    const drawer = document.querySelector('aside[aria-label="Maison assistant"]') as HTMLElement;
    expect(drawer).not.toBeNull();
    expect(drawer.hasAttribute('inert')).toBe(false);
    expect(drawer.querySelectorAll('[data-message-part="draft"]')).toHaveLength(2);
  });

  it('takes an answer to the Questions tab and opens Answer with the text, Add to product knowledge ticked, and the line about the draft', async () => {
    renderInTheme(<Admin path="/plugins/maison?tab=inquiries" />);
    await openDrawer();

    await userEvent.click(useButtons()[1]);

    const box = (await screen.findByRole('textbox', { name: 'Your answer' })) as HTMLTextAreaElement;
    expect(where()).toBe('/plugins/maison?tab=questions');
    expect(box.value).toBe(ANSWER_TEXT);
    expect(screen.getByText(DRAFTED_LINE)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Add to product knowledge' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Answer Q-4821' })).toBeTruthy();
  });

  it('opens nothing and says why when the inquiry was replied to meanwhile, and the card stays in the chat', async () => {
    world.inquiry = { ...INQUIRY, status: 'replied', repliedBy: 'Jane' };
    renderInTheme(<Admin path="/content-manager" />);
    await openDrawer();

    await userEvent.click(useButtons()[0]);

    await waitFor(() =>
      expect(notify.toggleNotification).toHaveBeenCalledExactlyOnceWith({ type: 'info', message: "This inquiry was replied to already. The draft wasn't used." })
    );
    expect(where()).toBe('/plugins/maison?tab=inquiries');
    expect(screen.queryByRole('textbox', { name: 'Your reply' })).toBeNull();
    expect(useButtons()).toHaveLength(2);
    expect(pendingDraft()).toBeNull();
  });

  it('says the item is gone when the question was deleted meanwhile', async () => {
    world.failure = Object.assign(new Error('No question Q-4821.'), { status: 404 });
    renderInTheme(<Admin path="/content-manager" />);
    await openDrawer();

    await userEvent.click(useButtons()[1]);

    await waitFor(() => expect(notify.toggleNotification).toHaveBeenCalledExactlyOnceWith({ type: 'info', message: NOT_FOUND_NOTICE }));
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).toBeNull();
  });

  it('can use the same draft again after the dialog was closed', async () => {
    renderInTheme(<Admin path="/content-manager" />);
    await openDrawer();
    await userEvent.click(useButtons()[0]);
    await screen.findByRole('textbox', { name: 'Your reply' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Your reply' })).toBeNull());

    await userEvent.click(useButtons()[0]);

    expect(((await screen.findByRole('textbox', { name: 'Your reply' })) as HTMLTextAreaElement).value).toBe(REPLY_TEXT);
  });
});
