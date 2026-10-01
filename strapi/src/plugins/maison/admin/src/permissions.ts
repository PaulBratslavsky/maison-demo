const REVIEW = { action: 'plugin::maison.appointments.review', subject: null };
const CONFIRM = { action: 'plugin::maison.appointments.confirm', subject: null };
const MANAGE = { action: 'plugin::maison.demo.manage', subject: null };

export const PERMISSIONS = {
  /** The menu entry and the page: staff who review requests, or who manage the demo data. Either one is enough. */
  page: [REVIEW, MANAGE],
  /** Checked with useRBAC, which answers canReview, canConfirm and canManage. */
  sections: [REVIEW, CONFIRM, MANAGE],
  /** The Homepage widget, which shows the requests board's numbers: staff who review requests. */
  widget: [REVIEW],
};
