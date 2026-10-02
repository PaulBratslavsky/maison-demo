const REVIEW = { action: 'plugin::maison.appointments.review', subject: null };
const CONFIRM = { action: 'plugin::maison.appointments.confirm', subject: null };
const MANAGE = { action: 'plugin::maison.demo.manage', subject: null };
const QUESTIONS_READ = { action: 'plugin::maison.questions.read', subject: null };
const QUESTIONS_ANSWER = { action: 'plugin::maison.questions.answer', subject: null };

export const PERMISSIONS = {
  /** The menu entry and the page: staff who review requests, read questions, or manage the demo data. Any one is enough. */
  page: [REVIEW, MANAGE, QUESTIONS_READ],
  /** Checked with useRBAC, which answers canReview, canConfirm, canManage, canRead and canAnswer. */
  sections: [REVIEW, CONFIRM, MANAGE, QUESTIONS_READ, QUESTIONS_ANSWER],
  /** The Homepage widget, which shows the requests board's numbers: staff who review requests. */
  widget: [REVIEW],
};
