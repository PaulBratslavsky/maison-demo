import { describe, expect, it, vi } from 'vitest';
import {
  DRAFTED_LINE,
  NOT_FOUND_NOTICE,
  answerDraftOutcome,
  canUseDraft,
  isAbortError,
  isNotFoundError,
  replyDraftOutcome,
  resolveDraft,
  type DraftAccess,
  type PageDraft,
} from '../../admin/src/drafts';
import { canReplyTo, type StaffInquiry } from '../../admin/src/inquiries';
import { PERMISSIONS } from '../../admin/src/permissions';
import { canAnswer, type StaffQuestion } from '../../admin/src/questions';
import { assistantTools } from '../../server/src/assistant/tools';
import { ACTION } from '../../server/src/constants';
import { PENDING_VIEW } from './fake-inquiries';
import { fakeStrapi } from './fake-strapi';

/*
 * What the page does with a draft, apart from React. Where a rule is "show this when the server offers that", the test asks
 * the server's own tool list, so the page can't drift from what the model is offered.
 */

const REPLY: PageDraft = { kind: 'reply', documentId: 'inq4abc', text: 'Thank you for telling us.' };
const ANSWER: PageDraft = { kind: 'answer', reference: 'Q-4821', text: 'Yes. A watch up to 42 mm fits.' };
const NO_ACCESS: DraftAccess = { canView: false, canReply: false, canRead: false, canAnswer: false };

describe('canUseDraft', () => {
  it('lets a reply be used with canView and canReply, and an answer with canRead and canAnswer', () => {
    expect(canUseDraft(REPLY, { ...NO_ACCESS, canView: true, canReply: true })).toBe(true);
    expect(canUseDraft(ANSWER, { ...NO_ACCESS, canRead: true, canAnswer: true })).toBe(true);
  });

  it.each([
    ['a reply with canView alone', REPLY, { canView: true }],
    ['a reply with canReply alone', REPLY, { canReply: true }],
    ['an answer with canRead alone', ANSWER, { canRead: true }],
    ['an answer with canAnswer alone', ANSWER, { canAnswer: true }],
    ['a reply with the two question flags', REPLY, { canRead: true, canAnswer: true }],
    ['an answer with the two inquiry flags', ANSWER, { canView: true, canReply: true }],
    ['a reply with no flag', REPLY, {}],
    ['an answer with no flag', ANSWER, {}],
  ])("does not let %s be used: one flag of a pair is not enough, and the other kind's flags do not count", (_label, draft, flags) => {
    expect(canUseDraft(draft, { ...NO_ACCESS, ...flags })).toBe(false);
  });

  it('treats a flag useRBAC has not answered as no permission', () => {
    // useRBAC holds only the flags the admin has, so the others are undefined, never false.
    expect(canUseDraft(REPLY, {} as never)).toBe(false);
    expect(canUseDraft(REPLY, { canView: true } as never)).toBe(false);
    expect(canUseDraft(ANSWER, { canRead: true } as never)).toBe(false);
  });
});

describe('Use this draft, and the draft tools the server offers', () => {
  const ACTION_OF = {
    canView: ACTION.inquiriesView,
    canReply: ACTION.inquiriesReply,
    canRead: ACTION.questionsRead,
    canAnswer: ACTION.questionsAnswer,
  } as const;
  const FLAGS = Object.keys(ACTION_OF) as Array<keyof typeof ACTION_OF>;
  /** Every mix of the four flags: 16. */
  const EVERY_ACCESS: DraftAccess[] = Array.from({ length: 2 ** FLAGS.length }, (_, mix) =>
    Object.fromEntries(FLAGS.map((flag, bit) => [flag, (mix & (1 << bit)) !== 0])) as unknown as DraftAccess
  );

  it('read four flags that the admin panel has for four actions, and nothing else', () => {
    expect([...FLAGS].sort()).toEqual(['canAnswer', 'canRead', 'canReply', 'canView']);
    expect(Object.keys(NO_ACCESS).sort()).toEqual([...FLAGS].sort());
    for (const flag of FLAGS) {
      const action = ACTION_OF[flag];
      expect(PERMISSIONS.assistantHost.some((permission) => permission.action === action), action).toBe(true);
      // useRBAC names a flag after the last word of the action.
      const last = action.split('.').at(-1) as string;
      expect(flag, action).toBe(`can${last.charAt(0).toUpperCase()}${last.slice(1)}`);
    }
    // The other flags the admin panel answers do not decide a draft.
    const others = { canReview: true, canConfirm: true, canManage: true, canUse: true };
    expect(canUseDraft(REPLY, { ...NO_ACCESS, ...others } as never)).toBe(false);
    expect(canUseDraft(ANSWER, { ...NO_ACCESS, ...others } as never)).toBe(false);
  });

  it.each(EVERY_ACCESS)('offers each draft tool exactly when the page shows Use this draft for it (%j)', (access) => {
    const granted = FLAGS.filter((flag) => access[flag]).map((flag) => ACTION_OF[flag]) as string[];
    const names = assistantTools(fakeStrapi(), { can: (action) => granted.includes(action) }).map((spec) => spec.name);

    expect(names.includes('draft_reply')).toBe(canUseDraft(REPLY, access));
    expect(names.includes('draft_answer')).toBe(canUseDraft(ANSWER, access));
  });
});

/** The inquiry as the Inquiries tab holds it: PENDING_VIEW is what the server's inquiries service shows staff for an inquiry just logged. */
const inquiryWith = (fields: Partial<StaffInquiry> = {}): StaffInquiry => ({ ...(PENDING_VIEW as unknown as StaffInquiry), ...fields });
const questionWith = (fields: Partial<StaffQuestion> = {}): StaffQuestion => ({
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
  ...fields,
});
const HAND_OFF = { reference: 'Q-4821', status: 'open' } as const;

describe('replyDraftOutcome', () => {
  it('opens the dialog for an open inquiry that is no hand-off', () => {
    expect(replyDraftOutcome(inquiryWith())).toEqual({ open: true });
  });

  it('says the item is gone for an inquiry that is not there any more', () => {
    expect(replyDraftOutcome(null)).toEqual({ open: false, notice: "Couldn't find this item. It may have been deleted." });
    expect(NOT_FOUND_NOTICE).toBe("Couldn't find this item. It may have been deleted.");
  });

  it('says a closed inquiry is closed, and that the draft was not used', () => {
    expect(replyDraftOutcome(inquiryWith({ status: 'closed', closeReason: 'not-needed' }))).toEqual({
      open: false,
      notice: "This inquiry is closed. The draft wasn't used.",
    });
  });

  it('says a replied inquiry was replied to already, and that the draft was not used', () => {
    expect(replyDraftOutcome(inquiryWith({ status: 'replied', repliedBy: 'Jane' }))).toEqual({
      open: false,
      notice: "This inquiry was replied to already. The draft wasn't used.",
    });
  });

  it('says a hand-off is answered under Questions, and names the question', () => {
    expect(replyDraftOutcome(inquiryWith({ handedOff: true, question: HAND_OFF }))).toEqual({
      open: false,
      notice: 'This inquiry is answered under Questions (Q-4821).',
    });
    // Even when that question no longer exists: the reference is still what staff look for.
    expect(replyDraftOutcome(inquiryWith({ handedOff: true, question: { reference: 'Q-4821', status: null } }))).toEqual({
      open: false,
      notice: 'This inquiry is answered under Questions (Q-4821).',
    });
  });

  it('checks closed, then replied, then the hand-off, in that order', () => {
    expect(replyDraftOutcome(inquiryWith({ status: 'closed', question: HAND_OFF }))).toMatchObject({ notice: "This inquiry is closed. The draft wasn't used." });
    expect(replyDraftOutcome(inquiryWith({ status: 'replied', question: HAND_OFF }))).toMatchObject({
      notice: "This inquiry was replied to already. The draft wasn't used.",
    });
  });

  it.each(['open', 'replied', 'closed'] as const)('opens the dialog exactly when canReplyTo allows a reply: %s, with and without a hand-off', (status) => {
    for (const question of [null, HAND_OFF]) {
      const inquiry = inquiryWith({ status, question });
      expect(replyDraftOutcome(inquiry).open, `${status}, hand-off ${question !== null}`).toBe(canReplyTo(inquiry));
    }
  });
});

describe('answerDraftOutcome', () => {
  it('opens the dialog for an open question, and for one a staff member took', () => {
    expect(answerDraftOutcome(questionWith({ status: 'open' }))).toEqual({ open: true });
    expect(answerDraftOutcome(questionWith({ status: 'taken', staffName: 'Jane' }))).toEqual({ open: true });
  });

  it('says the item is gone for a question that is not there any more', () => {
    expect(answerDraftOutcome(null)).toEqual({ open: false, notice: NOT_FOUND_NOTICE });
  });

  it('says an answered question was answered already, with its reference, and that the draft was not used', () => {
    expect(answerDraftOutcome(questionWith({ status: 'answered', staffName: 'Hana', answer: 'Yes.' }))).toEqual({
      open: false,
      notice: "Q-4821 was answered already. The draft wasn't used.",
    });
    expect(answerDraftOutcome(questionWith({ reference: 'Q-1234', status: 'answered' }))).toMatchObject({
      notice: "Q-1234 was answered already. The draft wasn't used.",
    });
  });

  it.each(['open', 'taken', 'answered'] as const)('opens the dialog exactly when canAnswer allows an answer: %s', (status) => {
    const question = questionWith({ status });
    expect(answerDraftOutcome(question).open).toBe(canAnswer(question));
  });
});

describe('DRAFTED_LINE', () => {
  it("is the line over a drafted box, in the spec's words", () => {
    expect(DRAFTED_LINE).toBe('Drafted by the Maison assistant. Check every fact and edit it before you send.');
  });
});

describe('isNotFoundError', () => {
  it('is true for a failed request with the status 404, as useFetchClient reports one', () => {
    expect(isNotFoundError(Object.assign(new Error('No inquiry "inq9".'), { status: 404 }))).toBe(true);
  });

  it.each([
    ['another status', Object.assign(new Error('Server Error'), { status: 500 })],
    ['a 403', Object.assign(new Error('Forbidden'), { status: 403 })],
    ['an error with no status', new Error('Failed to fetch')],
    ['a status that is text', { status: '404' }],
    ['null', null],
    ['undefined', undefined],
    ['text', 'not found'],
  ])('is false for %s', (_label, error) => {
    expect(isNotFoundError(error)).toBe(false);
  });
});

// useFetchClient aborts a component's requests when it unmounts, so an abort means the list was left while the item loaded.
describe('isAbortError', () => {
  it('is true for the error a request cancelled by leaving the tab ends with', () => {
    expect(isAbortError(new DOMException('signal is aborted without reason', 'AbortError'))).toBe(true);
    expect(isAbortError(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))).toBe(true);
  });

  it.each([
    ['a failed request', Object.assign(new Error('Server Error'), { status: 500 })],
    ['a timeout', new DOMException('x', 'TimeoutError')],
    ['null', null],
    ['undefined', undefined],
    ['text', 'AbortError'],
  ])('is false for %s', (_label, error) => {
    expect(isAbortError(error)).toBe(false);
  });
});

describe('resolveDraft', () => {
  it('opens the dialog over the item when it can take the draft', async () => {
    const inquiry = inquiryWith();
    await expect(resolveDraft(async () => inquiry, replyDraftOutcome)).resolves.toEqual({ action: 'open', item: inquiry });
  });

  it('shows the outcome as an info notice, and opens nothing, when the item cannot take the draft', async () => {
    await expect(resolveDraft(async () => inquiryWith({ status: 'replied' }), replyDraftOutcome)).resolves.toEqual({
      action: 'notify',
      type: 'info',
      message: "This inquiry was replied to already. The draft wasn't used.",
    });
    await expect(resolveDraft(async () => questionWith({ status: 'answered' }), answerDraftOutcome)).resolves.toEqual({
      action: 'notify',
      type: 'info',
      message: "Q-4821 was answered already. The draft wasn't used.",
    });
  });

  it('says the item is gone when the server answers 404: an inquiry deleted since its row loaded, or a reference that was never there', async () => {
    const gone = async () => {
      throw Object.assign(new Error('No inquiry "inq9".'), { status: 404 });
    };
    await expect(resolveDraft(gone, replyDraftOutcome)).resolves.toEqual({ action: 'notify', type: 'info', message: NOT_FOUND_NOTICE });
    await expect(resolveDraft(gone, answerDraftOutcome)).resolves.toEqual({ action: 'notify', type: 'info', message: NOT_FOUND_NOTICE });
  });

  it('says the item is gone when the answer holds no item', async () => {
    await expect(resolveDraft(async () => null, replyDraftOutcome)).resolves.toEqual({ action: 'notify', type: 'info', message: NOT_FOUND_NOTICE });
  });

  it('shows any other failure in its own words, as a danger notice, and decides nothing about the draft', async () => {
    const outcomeOf = vi.fn(replyDraftOutcome);
    const down = async () => {
      throw Object.assign(new Error('Strapi is down.'), { status: 500 });
    };

    await expect(resolveDraft(down, outcomeOf)).resolves.toEqual({ action: 'notify', type: 'danger', message: 'Strapi is down.' });

    expect(outcomeOf).not.toHaveBeenCalled();
  });

  it.each([
    ['an error with no message', new Error('')],
    ['a failure that is not an error', 'offline'],
    ['nothing', undefined],
  ])('says something went wrong for %s', async (_label, failure) => {
    const failing = async () => {
      throw failure;
    };
    await expect(resolveDraft(failing, replyDraftOutcome)).resolves.toEqual({ action: 'notify', type: 'danger', message: 'Something went wrong. Try again.' });
  });

  // The request was cancelled because staff left the tab while the item loaded. Nothing is wrong, so there is no notice.
  it.each([
    ['replies', replyDraftOutcome],
    ['answers', answerDraftOutcome],
  ])('says nothing and decides nothing when the request was cancelled, for %s', async (_label, outcome) => {
    const outcomeOf = vi.fn(outcome as (item: unknown) => ReturnType<typeof replyDraftOutcome>);
    const left = async () => {
      throw new DOMException('signal is aborted without reason', 'AbortError');
    };

    await expect(resolveDraft(left, outcomeOf)).resolves.toEqual({ action: 'cancelled' });

    expect(outcomeOf).not.toHaveBeenCalled();
  });
});
