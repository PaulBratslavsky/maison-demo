import { describe, expect, it } from 'vitest';
import { TAB_LABELS, visibleTabs } from '../../admin/src/tabs';

describe('the tabs of the Maison page', () => {
  it('are Requests, Questions and Inquiries', () => {
    expect(TAB_LABELS).toEqual({ requests: 'Requests', questions: 'Questions', inquiries: 'Inquiries' });
  });

  it('are all three, in that order, for an admin who may see all of them', () => {
    expect(visibleTabs({ canReview: true, canRead: true, canView: true })).toEqual(['requests', 'questions', 'inquiries']);
  });

  it.each([
    ['review requests', { canReview: true, canRead: false, canView: false }, ['requests']],
    ['read questions', { canReview: false, canRead: true, canView: false }, ['questions']],
    ['view inquiries', { canReview: false, canRead: false, canView: true }, ['inquiries']],
    ['review requests and view inquiries', { canReview: true, canRead: false, canView: true }, ['requests', 'inquiries']],
    ['read questions and view inquiries', { canReview: false, canRead: true, canView: true }, ['questions', 'inquiries']],
    ['review requests and read questions', { canReview: true, canRead: true, canView: false }, ['requests', 'questions']],
  ])('are only what an admin who can %s may see', (_label, flags, tabs) => {
    expect(visibleTabs(flags)).toEqual(tabs);
  });

  it('are none for an admin who can only manage the demo data: the page shows just that', () => {
    expect(visibleTabs({ canReview: false, canRead: false, canView: false })).toEqual([]);
  });

  it('treat a flag useRBAC has not answered as no permission', () => {
    expect(visibleTabs({} as never)).toEqual([]);
    expect(visibleTabs({ canView: true } as never)).toEqual(['inquiries']);
  });
});
