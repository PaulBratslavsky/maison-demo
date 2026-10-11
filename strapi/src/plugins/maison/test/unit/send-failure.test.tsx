// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestionsList } from '../../admin/src/components/QuestionsList';
import { RequestsBoard } from '../../admin/src/components/RequestsBoard';
import { SEND_MAY_HAVE_STOPPED, sendFailureNotice } from '../../admin/src/sendFailure';
import { useInquiryActions } from '../../admin/src/useInquiryActions';
import { renderInTheme } from './render';

/*
 * Staff press a button that sends to a customer on LINE, and then leave the tab. Strapi's fetch client cancels a component's requests when it is
 * removed, so the request ends with the browser's own words ("signal is aborted without reason"). The send may well have reached the server and LINE.
 * Showing those words in red invites a second send, and the customer gets the message twice. The notice says what is true instead.
 */
const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const notify = vi.hoisted(() => ({ toggleNotification: vi.fn() }));
vi.mock('@strapi/strapi/admin', () => ({ useFetchClient: () => client, useNotification: () => notify }));

const aborted = () => new DOMException('signal is aborted without reason', 'AbortError');

beforeEach(() => {
  client.get.mockReset();
  client.post.mockReset();
  notify.toggleNotification.mockReset();
});

describe('sendFailureNotice', () => {
  it('warns that leaving the tab may have stopped the send, for a request that was cancelled, and never shows the browser\'s words', () => {
    const notice = sendFailureNotice(aborted());
    expect(notice).toEqual({ type: 'warning', message: SEND_MAY_HAVE_STOPPED });
    expect(SEND_MAY_HAVE_STOPPED).toBe('Leaving the tab may have stopped the send. Check the row before you send again.');
    expect(notice.message).not.toContain('aborted');
  });

  it('shows any other failure in the server\'s own words, as a danger notice', () => {
    expect(sendFailureNotice(Object.assign(new Error('LINE refused the message.'), { status: 502 }))).toEqual({ type: 'danger', message: 'LINE refused the message.' });
  });
});

describe('Reply on LINE, Close, Change label and Label again', () => {
  it('say that leaving the tab may have stopped the send, when the request was cancelled', async () => {
    client.post.mockRejectedValue(aborted());
    const { result } = renderHook(() => useInquiryActions(async () => {}));

    await act(async () => {
      await result.current.run('inq-1', 'reply', { text: 'Thank you.' });
    });

    expect(notify.toggleNotification).toHaveBeenCalledExactlyOnceWith({ type: 'warning', message: SEND_MAY_HAVE_STOPPED });
  });

  it('show another failure in its own words, as before', async () => {
    client.post.mockRejectedValue(Object.assign(new Error('This inquiry was replied to already.'), { status: 409 }));
    const { result } = renderHook(() => useInquiryActions(async () => {}));

    await act(async () => {
      await result.current.run('inq-1', 'close', { reason: 'not-needed' });
    });

    expect(notify.toggleNotification).toHaveBeenCalledExactlyOnceWith({ type: 'danger', message: 'This inquiry was replied to already.' });
  });
});

const QUESTION = {
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
  createdAt: '2026-10-08T01:00:00.000Z',
};

describe('Let them know and Answer', () => {
  it('say that leaving the tab may have stopped the send, when the request was cancelled', async () => {
    client.get.mockImplementation(async (url: string) => {
      if (url === '/maison/questions') return { data: { questions: [QUESTION] } };
      throw new Error(`Unexpected GET ${url}`);
    });
    client.post.mockRejectedValue(aborted());
    renderInTheme(<QuestionsList canAnswer refreshKey={0} draft={null} onDraftTaken={() => {}} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Let them know' }));

    await waitFor(() => expect(notify.toggleNotification).toHaveBeenCalledWith({ type: 'warning', message: SEND_MAY_HAVE_STOPPED }));
    expect(notify.toggleNotification).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'danger' }));
  });
});

describe('Confirm and Send again', () => {
  it('say that leaving the tab may have stopped the send, when the request was cancelled', async () => {
    client.get.mockImplementation(async (url: string) => {
      if (url === '/maison/appointments') {
        return {
          data: {
            appointments: [
              {
                reference: 'APT-4821',
                status: 'requested',
                customer: 'line:U4af…88',
                boutique: { slug: 'ginza', name: 'Ginza' },
                requestedFor: '2099-10-10T14:00:00+09:00',
                products: [],
                note: '',
                createdVia: 'concierge',
                confirmationSent: false,
                demoCustomer: false,
                yourLine: false,
                createdAt: '2026-10-08T01:00:00.000Z',
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    client.post.mockRejectedValue(aborted());
    renderInTheme(<RequestsBoard canConfirm refreshKey={0} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(notify.toggleNotification).toHaveBeenCalledWith({ type: 'warning', message: SEND_MAY_HAVE_STOPPED }));
    expect(notify.toggleNotification).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'danger' }));
  });
});
