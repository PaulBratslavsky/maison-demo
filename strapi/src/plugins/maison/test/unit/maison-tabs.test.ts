import { describe, expect, it } from 'vitest';
import { LIST_TABS, PAGE_SUBTITLE, TAB_LABELS, selectTab, tabCounts, tabLabel, visibleTabs } from '../../admin/src/tabs';
import { COUNTS } from '../../admin/src/inquiries';
import { isSummary } from '../../admin/src/inquiries';
import { world } from './fake-inquiries';

describe('the tabs of the Maison page', () => {
  it('are Requests, Questions, Inquiries and Ask', () => {
    expect(TAB_LABELS).toEqual({ requests: 'Requests', questions: 'Questions', inquiries: 'Inquiries', ask: 'Ask' });
  });

  it('keep the three lists apart from Ask: LIST_TABS are the lists, in the order of the page', () => {
    expect(LIST_TABS).toEqual(['requests', 'questions', 'inquiries']);
  });

  it('are the three lists, in that order, for an admin who may see all of them and not use the assistant', () => {
    expect(visibleTabs({ canReview: true, canRead: true, canView: true, canUse: false })).toEqual(['requests', 'questions', 'inquiries']);
  });

  it('are all four, with Ask last, for an admin who may see all of them and use the assistant', () => {
    expect(visibleTabs({ canReview: true, canRead: true, canView: true, canUse: true })).toEqual(['requests', 'questions', 'inquiries', 'ask']);
  });

  it('are Ask alone for an admin who can use the assistant and read nothing: the permission adds the tab, and it is not a list', () => {
    expect(visibleTabs({ canReview: false, canRead: false, canView: false, canUse: true })).toEqual(['ask']);
  });

  it('put Ask after whichever lists an admin may see', () => {
    expect(visibleTabs({ canReview: false, canRead: true, canView: false, canUse: true })).toEqual(['questions', 'ask']);
    expect(visibleTabs({ canReview: true, canRead: false, canView: true, canUse: true })).toEqual(['requests', 'inquiries', 'ask']);
  });

  it.each([
    ['review requests', { canReview: true, canRead: false, canView: false, canUse: false }, ['requests']],
    ['read questions', { canReview: false, canRead: true, canView: false, canUse: false }, ['questions']],
    ['view inquiries', { canReview: false, canRead: false, canView: true, canUse: false }, ['inquiries']],
    ['review requests and view inquiries', { canReview: true, canRead: false, canView: true, canUse: false }, ['requests', 'inquiries']],
    ['read questions and view inquiries', { canReview: false, canRead: true, canView: true, canUse: false }, ['questions', 'inquiries']],
    ['review requests and read questions', { canReview: true, canRead: true, canView: false, canUse: false }, ['requests', 'questions']],
  ])('are only what an admin who can %s may see', (_label, flags, tabs) => {
    expect(visibleTabs(flags)).toEqual(tabs);
  });

  it('are none for an admin who can only manage the demo data: the page shows just that', () => {
    expect(visibleTabs({ canReview: false, canRead: false, canView: false, canUse: false })).toEqual([]);
  });

  it('treat a flag useRBAC has not answered as no permission', () => {
    expect(visibleTabs({} as never)).toEqual([]);
    expect(visibleTabs({ canView: true } as never)).toEqual(['inquiries']);
    expect(visibleTabs({ canView: true, canUse: undefined } as never)).toEqual(['inquiries']);
  });
});

describe('the page subtitle', () => {
  // The subtitle sat on the page after the Inquiries tab was added, and still named only requests and questions.
  it('names what each list tab shows: the requests, the questions and the inquiries', () => {
    const subtitle = PAGE_SUBTITLE.toLowerCase();
    for (const tab of LIST_TABS) expect(subtitle, TAB_LABELS[tab]).toContain(TAB_LABELS[tab].toLowerCase());
  });

  it('does not name Ask: admins without the permission read it too, and Ask is not a list', () => {
    expect(PAGE_SUBTITLE).not.toMatch(/\bask\b/i);
  });
});

describe('tabLabel', () => {
  it("writes how many are waiting after the tab's name", () => {
    expect(tabLabel('requests', 3)).toBe('Requests 3');
    expect(tabLabel('questions', 2)).toBe('Questions 2');
    expect(tabLabel('inquiries', 2)).toBe('Inquiries 2');
  });

  it('writes the name alone when nothing is waiting, and before the number has loaded', () => {
    for (const tab of ['requests', 'questions', 'inquiries'] as const) {
      expect(tabLabel(tab, 0), tab).toBe(TAB_LABELS[tab]);
      expect(tabLabel(tab, null), tab).toBe(TAB_LABELS[tab]);
      expect(tabLabel(tab, undefined), tab).toBe(TAB_LABELS[tab]);
    }
  });

  it('writes the name alone for a number that is not a count', () => {
    for (const waiting of [Number.NaN, Number.POSITIVE_INFINITY, -1, 2.5, '2' as never]) {
      expect(tabLabel('questions', waiting), String(waiting)).toBe('Questions');
    }
  });

  it('writes thousands with a comma, as the quota line does', () => {
    expect(tabLabel('inquiries', 1234)).toBe('Inquiries 1,234');
  });

  it('writes Ask alone, whatever number it is given: it has no count', () => {
    for (const waiting of [0, 3, 1234, null, undefined]) expect(tabLabel('ask', waiting), String(waiting)).toBe('Ask');
  });
});

describe('the number on each tab', () => {
  const REQUESTS = { counts: { waitingForStaff: 3, confirmedUpcoming: 2, confirmationsSent: 1 } };

  it('is the requests waiting for staff, the questions the Open filter lists, and the inquiries that need an answer', () => {
    expect(tabCounts({ requests: REQUESTS, questions: 2, inquiries: { needsAnswer: 4, complaint: 5, praise: 6, notLabelled: 7 } })).toEqual({
      requests: 3,
      questions: 2,
      inquiries: 4,
      ask: null,
    });
  });

  it('is none for a tab whose number has not loaded', () => {
    expect(tabCounts({ requests: null, questions: null, inquiries: null })).toEqual({ requests: null, questions: null, inquiries: null, ask: null });
  });

  it("reads the key the server's inquiries summary has for Needs an answer", async () => {
    const summary = await world({ rows: [] }).service.summary();
    expect(isSummary(summary)).toBe(true);
    expect(COUNTS[0].key).toBe('needsAnswer');
    expect(tabCounts({ requests: null, questions: null, inquiries: summary }).inquiries).toBe(summary.needsAnswer);
  });
});

describe('selectTab', () => {
  const ALL = ['requests', 'questions', 'inquiries', 'ask'] as const;

  it.each(ALL)('opens the %s tab when the address asks for it and the admin may see it', (tab) => {
    expect(selectTab(ALL, tab)).toBe(tab);
  });

  it('opens the first tab when the address asks for none', () => {
    expect(selectTab(ALL, null)).toBe('requests');
    expect(selectTab(ALL, undefined)).toBe('requests');
    expect(selectTab(ALL, '')).toBe('requests');
    expect(selectTab(['questions', 'inquiries'], null)).toBe('questions');
  });

  it("opens the first tab the admin may see when the one asked for isn't theirs", () => {
    expect(selectTab(['questions'], 'inquiries')).toBe('questions');
    expect(selectTab(['inquiries'], 'requests')).toBe('inquiries');
    expect(selectTab(['requests', 'questions'], 'inquiries')).toBe('requests');
  });

  it("opens the first tab for a name that isn't a tab, including the names every object has", () => {
    for (const name of ['nonsense', 'Inquiries', 'INQUIRIES', ' inquiries', 'toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(selectTab(ALL, name), name).toBe('requests');
    }
  });

  it('opens nothing for an admin with no tabs', () => {
    expect(selectTab([], 'inquiries')).toBeUndefined();
    expect(selectTab([], null)).toBeUndefined();
  });

  it('opens Ask when the address asks for it and the admin may use it, and the first tab when they may not', () => {
    expect(selectTab(['requests', 'ask'], 'ask')).toBe('ask');
    expect(selectTab(['requests', 'questions'], 'ask')).toBe('requests');
  });

  it('reads a query string as the address gives it', () => {
    expect(selectTab(ALL, new URLSearchParams('tab=inquiries').get('tab'))).toBe('inquiries');
    expect(selectTab(ALL, new URLSearchParams('tab=questions&x=1').get('tab'))).toBe('questions');
    expect(selectTab(ALL, new URLSearchParams('').get('tab'))).toBe('requests');
  });
});
