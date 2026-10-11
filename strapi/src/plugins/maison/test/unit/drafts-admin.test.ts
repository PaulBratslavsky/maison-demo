import { describe, expect, it } from 'vitest';
import { canUseDraft, type DraftAccess, type PageDraft } from '../../admin/src/drafts';
import { PERMISSIONS } from '../../admin/src/permissions';
import { assistantTools } from '../../server/src/assistant/tools';
import { ACTION } from '../../server/src/constants';
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
