const REVIEW = { action: 'plugin::maison.appointments.review', subject: null };
const CONFIRM = { action: 'plugin::maison.appointments.confirm', subject: null };
const MANAGE = { action: 'plugin::maison.demo.manage', subject: null };
const QUESTIONS_READ = { action: 'plugin::maison.questions.read', subject: null };
const QUESTIONS_ANSWER = { action: 'plugin::maison.questions.answer', subject: null };
const INQUIRIES_VIEW = { action: 'plugin::maison.inquiries.view', subject: null };
const INQUIRIES_REPLY = { action: 'plugin::maison.inquiries.reply', subject: null };

export const PERMISSIONS = {
  /** The menu entry and the page: staff who review requests, read questions, review inquiries, or manage the demo data. Any one is enough. */
  page: [REVIEW, MANAGE, QUESTIONS_READ, INQUIRIES_VIEW],
  /** Checked with useRBAC, which answers canReview, canConfirm, canManage, canRead, canAnswer, canView and canReply. */
  sections: [REVIEW, CONFIRM, MANAGE, QUESTIONS_READ, QUESTIONS_ANSWER, INQUIRIES_VIEW, INQUIRIES_REPLY],
  /** The Homepage widget, which shows the requests board's numbers: staff who review requests. */
  widget: [REVIEW],
  /** The second Homepage widget, which shows the open inquiries by queue: staff who review inquiries. */
  inquiriesWidget: [INQUIRIES_VIEW],
};
