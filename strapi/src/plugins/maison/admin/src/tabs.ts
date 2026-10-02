/** The tabs of the Maison page. Each shows one list, to the admins whose role may see it. */
export type MaisonTab = 'requests' | 'questions' | 'inquiries';

export const TAB_LABELS: Record<MaisonTab, string> = { requests: 'Requests', questions: 'Questions', inquiries: 'Inquiries' };

/** The flags useRBAC answers for the page's permissions: review requests, read questions, review inquiries. */
export interface TabAccess {
  canReview: boolean;
  canRead: boolean;
  canView: boolean;
}

/**
 * The tabs an admin sees, in the order of the page: Requests with canReview, Questions with canRead, Inquiries with
 * canView. An admin who can only manage the demo data has none, and the page shows just that. A flag useRBAC has not
 * answered counts as no permission.
 */
export const visibleTabs = ({ canReview, canRead, canView }: TabAccess): MaisonTab[] => [
  ...(canReview ? (['requests'] as const) : []),
  ...(canRead ? (['questions'] as const) : []),
  ...(canView ? (['inquiries'] as const) : []),
];
