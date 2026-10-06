/** The tabs of the Maison page. Each of the first three shows one list, to the admins whose role may see it. Ask is the assistant's chat. */
export type MaisonTab = 'requests' | 'questions' | 'inquiries' | 'ask';

export const TAB_LABELS: Record<MaisonTab, string> = { requests: 'Requests', questions: 'Questions', inquiries: 'Inquiries', ask: 'Ask' };

/** The tabs that hold a list, in the order of the page. The page's subtitle names these three, and a test holds it to them. */
export const LIST_TABS = ['requests', 'questions', 'inquiries'] as const;

/** The line under the page's title: what each list tab holds (a test holds it to their names), as it arrives. It doesn't name Ask: admins without the permission read it too. */
export const PAGE_SUBTITLE = 'Boutique appointment requests, customer questions and customer inquiries, as they arrive.';

/** The flags useRBAC answers for the page's permissions: review requests, read questions, review inquiries, use the assistant. */
export interface TabAccess {
  canReview: boolean;
  canRead: boolean;
  canView: boolean;
  canUse: boolean;
}

/**
 * The tabs an admin sees, in the order of the page: Requests with canReview, Questions with canRead, Inquiries with
 * canView, and Ask last with canUse. An admin who can only manage the demo data has none, and the page shows just that.
 * A flag useRBAC has not answered counts as no permission.
 */
export const visibleTabs = ({ canReview, canRead, canView, canUse }: TabAccess): MaisonTab[] => [
  ...(canReview ? (['requests'] as const) : []),
  ...(canRead ? (['questions'] as const) : []),
  ...(canView ? (['inquiries'] as const) : []),
  ...(canUse ? (['ask'] as const) : []),
];

/**
 * A tab's label: its name, and after it how many are waiting in it, like "Questions 2". No number when nothing is
 * waiting, or before the number has loaded, so a tab with nothing to do looks as it always did. Ask has no number.
 */
export const tabLabel = (tab: MaisonTab, waiting: number | null | undefined): string =>
  tab !== 'ask' && typeof waiting === 'number' && Number.isInteger(waiting) && waiting > 0 ? `${TAB_LABELS[tab]} ${waiting.toLocaleString('en-US')}` : TAB_LABELS[tab];

/** What each tab's number is counted from: the answer of its own route, null until it has loaded. */
export interface TabSources {
  requests: { counts: { waitingForStaff: number } } | null;
  /** How many questions the Open filter lists. */
  questions: number | null;
  inquiries: { needsAnswer: number } | null;
}

/**
 * The number on each tab, which is what asks something of staff: the requests waiting for staff, the questions that are
 * open or taken, and the inquiries in Needs an answer. The Complaints, Praise and Not labelled counts stay on the
 * Inquiries tab's own cards. Ask has none.
 */
export const tabCounts = ({ requests, questions, inquiries }: TabSources): Record<MaisonTab, number | null> => ({
  requests: requests?.counts.waitingForStaff ?? null,
  questions,
  inquiries: inquiries?.needsAnswer ?? null,
  ask: null,
});

/**
 * The tab the page opens on: the one the address names (`?tab=inquiries`) when the admin may see it, else the first of
 * their tabs, and nothing for an admin with none. A name that isn't a tab, or is spelt in another case, is not one.
 */
export const selectTab = (tabs: readonly MaisonTab[], requested: string | null | undefined): MaisonTab | undefined =>
  tabs.find((tab) => tab === requested) ?? tabs[0];
